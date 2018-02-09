defineSuite([
        'Core/ClippingPlaneCollection',
        'Core/AttributeCompression',
        'Core/BoundingSphere',
        'Core/Cartesian2',
        'Core/Cartesian3',
        'Core/Cartesian4',
        'Core/Color',
        'Core/Math',
        'Core/PixelFormat',
        'Renderer/PixelDatatype',
        'Core/Intersect',
        'Core/Matrix4',
        'Core/Plane',
        'Specs/createScene',
        'Renderer/TextureMagnificationFilter',
        'Renderer/TextureMinificationFilter',
        'Renderer/TextureWrap'
    ], function(
        ClippingPlaneCollection,
        AttributeCompression,
        BoundingSphere,
        Cartesian2,
        Cartesian3,
        Cartesian4,
        Color,
        CesiumMath,
        PixelFormat,
        PixelDatatype,
        Intersect,
        Matrix4,
        Plane,
        createScene,
        TextureMagnificationFilter,
        TextureMinificationFilter,
        TextureWrap) {
    'use strict';

    var clippingPlanes;
    var planes = [
        new Plane(Cartesian3.UNIT_X, 1.0),
        new Plane(Cartesian3.UNIT_Y, 2.0)
    ];

    var transform = new Matrix4.fromTranslation(new Cartesian3(1.0, 3.0, 2.0));
    var boundingVolume  = new BoundingSphere(Cartesian3.ZERO, 1.0);

    var unpackVec4 = new Cartesian4(1.0, 1.0 / 255.0, 1.0 / 65025.0, 1.0 / 16581375.0);
    var unormScratch = new Cartesian4();
    function decodePlane(pixel1, pixel2, distanceRange) {
        // expect pixel1 to be the normal
        var xOct16 = pixel1.x * 256 + pixel1.y;
        var yOct16 = pixel1.z * 256 + pixel1.w;
        var normal = AttributeCompression.octDecodeInRange(xOct16, yOct16, 65535, new Cartesian3());

        // expect pixel2 to be the distance
        var unormPixel2 = Cartesian4.multiplyByScalar(pixel2, 1 / 255, unormScratch);
        var normalizedDistance = Cartesian4.dot(unpackVec4, unormPixel2);
        var distance = (distanceRange.y - distanceRange.x) * normalizedDistance + distanceRange.x;
        return new Plane(normal, distance);
    }

    it('default constructor', function() {
        clippingPlanes = new ClippingPlaneCollection();
        expect(clippingPlanes._planes).toEqual([]);
        expect(clippingPlanes.enabled).toEqual(true);
        expect(clippingPlanes.modelMatrix).toEqual(Matrix4.IDENTITY);
        expect(clippingPlanes.edgeColor).toEqual(Color.WHITE);
        expect(clippingPlanes.edgeWidth).toEqual(0.0);
        expect(clippingPlanes.unionClippingRegions).toEqual(false);
        expect(clippingPlanes._testIntersection).not.toBeUndefined();
    });

    it('gets the length of the list of planes in the collection', function() {
        clippingPlanes = new ClippingPlaneCollection();

        expect(clippingPlanes.length).toBe(0);

        clippingPlanes._planes = planes.slice();

        expect(clippingPlanes.length).toBe(2);

        clippingPlanes._planes.push(new Plane(Cartesian3.UNIT_Z, -1.0));

        expect(clippingPlanes.length).toBe(3);

        clippingPlanes = new ClippingPlaneCollection({
            planes : planes
        });

        expect(clippingPlanes.length).toBe(2);
    });

    it('add adds a plane to the collection', function() {
        clippingPlanes = new ClippingPlaneCollection();
        clippingPlanes.add(planes[0]);

        expect(clippingPlanes.length).toBe(1);
        expect(clippingPlanes._planes[0]).toBe(planes[0]);
    });

    it('add throws developer error if the added plane exceeds the maximum number of planes', function() {
        clippingPlanes = new ClippingPlaneCollection();
        clippingPlanes._planes = new Array(ClippingPlaneCollection.MAX_CLIPPING_PLANES);

        expect(function() {
            clippingPlanes.add(new Plane(Cartesian3.UNIT_Z, -1.0));
        }).toThrowDeveloperError();
    });

    it('gets the plane at an index', function() {
        clippingPlanes = new ClippingPlaneCollection({
            planes : planes
        });

        var plane = clippingPlanes.get(0);
        expect(plane).toBe(planes[0]);

        plane = clippingPlanes.get(1);
        expect(plane).toBe(planes[1]);

        plane = clippingPlanes.get(2);
        expect(plane).toBeUndefined();
    });

    it('contain checks if the collection contains a plane', function() {
        clippingPlanes = new ClippingPlaneCollection({
            planes : planes
        });

        expect(clippingPlanes.contains(planes[0])).toBe(true);
        expect(clippingPlanes.contains(new Plane(Cartesian3.UNIT_Y, 2.0))).toBe(true);
        expect(clippingPlanes.contains(new Plane(Cartesian3.UNIT_Z, 3.0))).toBe(false);
    });

    it('remove removes and the first occurrence of a plane', function() {
        clippingPlanes = new ClippingPlaneCollection({
            planes : planes
        });

        expect(clippingPlanes.contains(planes[0])).toBe(true);

        var result = clippingPlanes.remove(planes[0]);

        expect(clippingPlanes.contains(planes[0])).toBe(false);
        expect(clippingPlanes.length).toBe(1);
        expect(clippingPlanes.get(0)).toEqual(planes[1]);
        expect(result).toBe(true);

        result = clippingPlanes.remove(planes[0]);
        expect(result).toBe(false);
    });

    it('update creates a RGBA ubyte texture with no filtering or wrapping to house packed clipping planes', function() {
        var scene = createScene();
        clippingPlanes = new ClippingPlaneCollection({
            planes : planes,
            enabled : false,
            edgeColor : Color.RED,
            modelMatrix : transform
        });

        clippingPlanes.update(scene.frameState);

        var packedTexture = clippingPlanes.texture;
        expect(packedTexture).toBeDefined();
        expect(packedTexture.width).toEqual(ClippingPlaneCollection.TEXTURE_WIDTH);
        expect(packedTexture.height).toEqual(ClippingPlaneCollection.TEXTURE_WIDTH);
        expect(packedTexture.pixelFormat).toEqual(PixelFormat.RGBA);
        expect(packedTexture.pixelDatatype).toEqual(PixelDatatype.UNSIGNED_BYTE);

        var sampler = packedTexture.sampler;
        expect(sampler.wrapS).toEqual(TextureWrap.CLAMP_TO_EDGE);
        expect(sampler.wrapT).toEqual(TextureWrap.CLAMP_TO_EDGE);
        expect(sampler.minificationFilter).toEqual(TextureMinificationFilter.NEAREST);
        expect(sampler.magnificationFilter).toEqual(TextureMinificationFilter.NEAREST);

        clippingPlanes.checkDestroy(); // since clippingPlanes has been updated, need to destroy textures
        scene.destroyForSpecs();
    });

    it('update populates uniforms for unpacking the clipping plane texture', function() {
        var scene = createScene();
        clippingPlanes = new ClippingPlaneCollection({
            planes : planes,
            enabled : false,
            edgeColor : Color.RED,
            modelMatrix : transform
        });

        clippingPlanes.update(scene.frameState);
        var expectedRange = new Cartesian2(1.0, 2.0);
        var actualRange = new Cartesian2();

        var lengthRange = clippingPlanes.lengthRange;
        expect(lengthRange.x).toEqual(2.0);
        actualRange.x = lengthRange.y;
        actualRange.y = lengthRange.z;
        expect(Cartesian2.equalsEpsilon(expectedRange, actualRange, CesiumMath.EPSILON3)).toEqual(true);

        var lengthRangeUnion = clippingPlanes.lengthRangeUnion;
        expect(lengthRangeUnion.x).toEqual(2);
        actualRange.x = lengthRangeUnion.y;
        actualRange.y = lengthRangeUnion.z;
        expect(Cartesian2.equalsEpsilon(expectedRange, actualRange, CesiumMath.EPSILON3)).toEqual(true);
        expect(lengthRangeUnion.w).toEqual(0);

        clippingPlanes.unionClippingRegions = true;
        clippingPlanes.update(scene.frameState);

        lengthRangeUnion = clippingPlanes.lengthRangeUnion;
        expect(lengthRangeUnion.x).toEqual(2);
        actualRange.x = lengthRangeUnion.y;
        actualRange.y = lengthRangeUnion.z;
        expect(Cartesian2.equalsEpsilon(expectedRange, actualRange, CesiumMath.EPSILON3)).toEqual(true);
        expect(lengthRangeUnion.w).toEqual(1);

        clippingPlanes.checkDestroy(); // since clippingPlanes has been updated, need to destroy textures
        scene.destroyForSpecs();
    });

    it('update fills the clipping plane texture with packed planes', function() {
        var scene = createScene();

        clippingPlanes = new ClippingPlaneCollection({
            planes : planes,
            enabled : false,
            edgeColor : Color.RED,
            modelMatrix : transform
        });

        var rgba;
        var gl = scene.frameState.context._gl;
        spyOn(gl, 'texSubImage2D').and.callFake(function(target, level, xoffset, yoffset, width, height, format, type, arrayBufferView) {
            rgba = arrayBufferView;
        });

        clippingPlanes.update(scene.frameState);
        expect(rgba).toBeDefined();
        expect(rgba.length).toEqual(ClippingPlaneCollection.TEXTURE_WIDTH * ClippingPlaneCollection.TEXTURE_WIDTH * 4);

        // Expect two clipping planes to use 4 pixels in the texture, so the first 16 bytes
        for (var i = 16; i < rgba.length; i++) {
            expect(rgba[i]).toEqual(0);
        }
        var pixel1 = Cartesian4.fromArray(rgba, 0);
        var pixel2 = Cartesian4.fromArray(rgba, 4);
        var pixel3 = Cartesian4.fromArray(rgba, 8);
        var pixel4 = Cartesian4.fromArray(rgba, 12);

        var lengthRangeUnion = clippingPlanes.lengthRangeUnion;
        var range = new Cartesian2(lengthRangeUnion.y, lengthRangeUnion.z);
        var plane1 = decodePlane(pixel1, pixel2, range);
        var plane2 = decodePlane(pixel3, pixel4, range);

        expect(Cartesian3.equalsEpsilon(plane1.normal, planes[0].normal, CesiumMath.EPSILON3)).toEqual(true);
        expect(Cartesian3.equalsEpsilon(plane2.normal, planes[1].normal, CesiumMath.EPSILON3)).toEqual(true);
        expect(CesiumMath.equalsEpsilon(plane1.distance, planes[0].distance, CesiumMath.EPSILON3)).toEqual(true);
        expect(CesiumMath.equalsEpsilon(plane2.distance, planes[1].distance, CesiumMath.EPSILON3)).toEqual(true);

        clippingPlanes.checkDestroy(); // since clippingPlanes has been updated, need to destroy textures
        scene.destroyForSpecs();
    });

    it('does not perform texture updates if the planes are unchanged', function() {
        var scene = createScene();

        var gl = scene.frameState.context._gl;
        spyOn(gl, 'texSubImage2D').and.callThrough();

        clippingPlanes = new ClippingPlaneCollection({
            planes : planes,
            enabled : false,
            edgeColor : Color.RED,
            modelMatrix : transform
        });
        expect(gl.texSubImage2D.calls.count()).toEqual(0);

        clippingPlanes.update(scene.frameState);
        expect(gl.texSubImage2D.calls.count()).toEqual(1);

        clippingPlanes.update(scene.frameState);
        expect(gl.texSubImage2D.calls.count()).toEqual(1);

        clippingPlanes.checkDestroy(); // since clippingPlanes has been updated, need to destroy textures
        scene.destroyForSpecs();
    });

    it('does not perform texture updates if the clippingPlaneCollection has been marked clean', function() {
        var scene = createScene();

        var gl = scene.frameState.context._gl;
        spyOn(gl, 'texSubImage2D').and.callThrough();

        clippingPlanes = new ClippingPlaneCollection({
            planes : planes,
            enabled : false,
            edgeColor : Color.RED,
            modelMatrix : transform
        });
        expect(gl.texSubImage2D.calls.count()).toEqual(0);

        clippingPlanes._planeTextureDirty = false; // Set by Cesium3DTileset so update() from Model won't burn CPU time packing/comparing
        clippingPlanes.update(scene.frameState);
        expect(gl.texSubImage2D.calls.count()).toEqual(0);

        clippingPlanes.checkDestroy(); // since clippingPlanes has been updated, need to destroy textures
        scene.destroyForSpecs();
    });

    it('does not destroy the ClippingPlaneCollection if an owner is specified unless the owner is provided', function() {
        var scene = createScene();

        var fakeCesium3DTileset = {};
        clippingPlanes = new ClippingPlaneCollection({
            planes : planes,
            enabled : false,
            edgeColor : Color.RED,
            modelMatrix : transform
        });
        clippingPlanes.owner = fakeCesium3DTileset;
        clippingPlanes.checkDestroy();
        expect(clippingPlanes.isDestroyed()).toEqual(false);
        clippingPlanes.checkDestroy(fakeCesium3DTileset);
        expect(clippingPlanes.isDestroyed()).toEqual(true);

        scene.destroyForSpecs();
    });

    it('clone without a result parameter returns new identical copy', function() {
        clippingPlanes = new ClippingPlaneCollection({
            planes : planes,
            enabled : false,
            edgeColor : Color.RED,
            modelMatrix : transform
        });

        var result = clippingPlanes.clone();
        expect(result).not.toBe(clippingPlanes);
        expect(result._planes[0]).toEqual(planes[0]);
        expect(result._planes[1]).toEqual(planes[1]);
        expect(result.enabled).toEqual(false);
        expect(result.modelMatrix).toEqual(transform);
        expect(result.edgeColor).toEqual(Color.RED);
        expect(result.edgeWidth).toEqual(0.0);
        expect(result.unionClippingRegions).toEqual(false);
        expect(result._testIntersection).not.toBeUndefined();
    });

    it('clone stores copy in result parameter', function() {
        clippingPlanes = new ClippingPlaneCollection({
            planes : planes,
            enabled : false,
            edgeColor : Color.RED,
            modelMatrix : transform
        });
        var result = new ClippingPlaneCollection();
        var copy = clippingPlanes.clone(result);
        expect(copy).toBe(result);
        expect(result._planes).not.toBe(planes);
        expect(result._planes[0]).toEqual(planes[0]);
        expect(result._planes[1]).toEqual(planes[1]);
        expect(result.enabled).toEqual(false);
        expect(result.modelMatrix).toEqual(transform);
        expect(result.edgeColor).toEqual(Color.RED);
        expect(result.edgeWidth).toEqual(0.0);
        expect(result.unionClippingRegions).toEqual(false);
        expect(result._testIntersection).not.toBeUndefined();

        // Only allocate a new array if needed
        var previousPlanes = result._planes;
        clippingPlanes.clone(result);
        expect(result._planes).toBe(previousPlanes);
    });

    it('setting unionClippingRegions updates testIntersection function', function() {
        clippingPlanes = new ClippingPlaneCollection();
        var originalIntersectFunction = clippingPlanes._testIntersection;

        expect(clippingPlanes._testIntersection).not.toBeUndefined();

        clippingPlanes.unionClippingRegions = true;

        expect(clippingPlanes._testIntersection).not.toBe(originalIntersectFunction);
    });

    it('computes intersections with bounding volumes when clipping regions are combined with an intersect operation', function() {
        clippingPlanes = new ClippingPlaneCollection();

        var intersect = clippingPlanes.computeIntersectionWithBoundingVolume(boundingVolume);
        expect(intersect).toEqual(Intersect.INSIDE);

        clippingPlanes.add(new Plane(Cartesian3.UNIT_X, -2.0));
        intersect = clippingPlanes.computeIntersectionWithBoundingVolume(boundingVolume);
        expect(intersect).toEqual(Intersect.OUTSIDE);

        clippingPlanes.add(new Plane(Cartesian3.UNIT_Y, 0.0));
        intersect = clippingPlanes.computeIntersectionWithBoundingVolume(boundingVolume);
        expect(intersect).toEqual(Intersect.INTERSECTING);

        clippingPlanes.add(new Plane(Cartesian3.UNIT_Z, 1.0));
        intersect = clippingPlanes.computeIntersectionWithBoundingVolume(boundingVolume);
        expect(intersect).toEqual(Intersect.INSIDE);

        clippingPlanes.add(new Plane(Cartesian3.UNIT_Z, 0.0));
        intersect = clippingPlanes.computeIntersectionWithBoundingVolume(boundingVolume);
        expect(intersect).toEqual(Intersect.INSIDE);
    });

    it('computes intersections with bounding volumes when clipping planes are combined with a union operation', function() {
        clippingPlanes = new ClippingPlaneCollection({
            unionClippingRegions : true
        });

        var intersect = clippingPlanes.computeIntersectionWithBoundingVolume(boundingVolume);
        expect(intersect).toEqual(Intersect.INSIDE);

        clippingPlanes.add(new Plane(Cartesian3.UNIT_Z, 1.0));
        intersect = clippingPlanes.computeIntersectionWithBoundingVolume(boundingVolume);
        expect(intersect).toEqual(Intersect.INSIDE);

        var temp = new Plane(Cartesian3.UNIT_Y, -2.0);
        clippingPlanes.add(temp);
        intersect = clippingPlanes.computeIntersectionWithBoundingVolume(boundingVolume);
        expect(intersect).toEqual(Intersect.OUTSIDE);

        clippingPlanes.add(new Plane(Cartesian3.UNIT_X, 0.0));
        intersect = clippingPlanes.computeIntersectionWithBoundingVolume(boundingVolume);
        expect(intersect).toEqual(Intersect.OUTSIDE);

        clippingPlanes.remove(temp);
        intersect = clippingPlanes.computeIntersectionWithBoundingVolume(boundingVolume);
        expect(intersect).toEqual(Intersect.INTERSECTING);
    });

    it('computes intersections applies optional transform to planes', function() {
        clippingPlanes = new ClippingPlaneCollection();

        var intersect = clippingPlanes.computeIntersectionWithBoundingVolume(boundingVolume, transform);
        expect(intersect).toEqual(Intersect.INSIDE);

        clippingPlanes.add(new Plane(Cartesian3.UNIT_X, -1.0));
        intersect = clippingPlanes.computeIntersectionWithBoundingVolume(boundingVolume, transform);
        expect(intersect).not.toEqual(Intersect.INSIDE);
    });
});
