// ==UserScript==
// @author         DELPHY79
// @name           ingress-intel-map-script.user.js
// @category       Info
// @version        0.1.20200225
// @description    Ingress Intel Map
// @id             cell-line
// @namespace      https://open.kakao.com/o/gVhrW8Z
// @updateURL      https://github.com/delphy79/ingress/raw/master/ingress-intel-map-script.user.js
// @downloadURL    https://github.com/delphy79/ingress/raw/master/ingress-intel-map-script.user.js
// @match          https://intel.ingress.com/*
// @grant          none
// ==/UserScript==

function wrapper(plugin_info) {
    // ensure plugin framework is there, even if iitc is not yet loaded
    if(typeof window.plugin !== 'function') window.plugin = function() {};

    //PLUGIN AUTHORS: writing a plugin outside of the IITC build environment? if so, delete these lines!!
    //(leaving them in place might break the 'About IITC' page or break update checks)
    plugin_info.buildName = 'release';
    plugin_info.dateTimeVersion = '2020-02-25-000000';
    plugin_info.pluginId = 'ingress-intel-map-script';
    //END PLUGIN AUTHORS NOTE

    window.plugin.cellline = function() {};

    window.plugin.cellline.pathArray = [];

    window.plugin.cellline.showCell = function() {
        map.panTo([37.555107, 126.674491]);
        map.setZoom(15);

        window.S2 = {};

        var LatLngToXYZ = function(latLng) {
            var d2r = Math.PI/180.0;

            var phi = latLng.lat*d2r;
            var theta = latLng.lng*d2r;

            var cosphi = Math.cos(phi);

            return [Math.cos(theta)*cosphi, Math.sin(theta)*cosphi, Math.sin(phi)];
        };

        var XYZToLatLng = function(xyz) {
            var r2d = 180.0/Math.PI;

            var lat = Math.atan2(xyz[2], Math.sqrt(xyz[0]*xyz[0]+xyz[1]*xyz[1]));
            var lng = Math.atan2(xyz[1], xyz[0]);

            return new google.maps.LatLng(lat*r2d, lng*r2d);
        };

        var largestAbsComponent = function(xyz) {
            var temp = [Math.abs(xyz[0]), Math.abs(xyz[1]), Math.abs(xyz[2])];

            if (temp[0] > temp[1]) {
                if (temp[0] > temp[2]) {
                    return 0;
                } else {
                    return 2;
                }
            } else {
                if (temp[1] > temp[2]) {
                    return 1;
                } else {
                    return 2;
                }
            }

        };

        var faceXYZToUV = function(face,xyz) {
            var u,v;

            switch (face) {
                case 0: u =  xyz[1]/xyz[0]; v =  xyz[2]/xyz[0]; break;
                case 1: u = -xyz[0]/xyz[1]; v =  xyz[2]/xyz[1]; break;
                case 2: u = -xyz[0]/xyz[2]; v = -xyz[1]/xyz[2]; break;
                case 3: u =  xyz[2]/xyz[0]; v =  xyz[1]/xyz[0]; break;
                case 4: u =  xyz[2]/xyz[1]; v = -xyz[0]/xyz[1]; break;
                case 5: u = -xyz[1]/xyz[2]; v = -xyz[0]/xyz[2]; break;
                default: throw {error: 'Invalid face'}; break;
            }

            return [u,v];
        }

        var XYZToFaceUV = function(xyz) {
            var face = largestAbsComponent(xyz);

            if (xyz[face] < 0) {
                face += 3;
            }

            var uv = faceXYZToUV (face,xyz);

            return [face, uv];
        };

        var FaceUVToXYZ = function(face,uv) {
            var u = uv[0];
            var v = uv[1];

            switch (face) {
                case 0: return [ 1, u, v];
                case 1: return [-u, 1, v];
                case 2: return [-u,-v, 1];
                case 3: return [-1,-v,-u];
                case 4: return [ v,-1,-u];
                case 5: return [ v, u,-1];
                default: throw {error: 'Invalid face'};
            }
        };

        var STToUV = function(st) {
            var singleSTtoUV = function(st) {
                if (st >= 0.5) {
                    return (1/3.0) * (4*st*st - 1);
                } else {
                    return (1/3.0) * (1 - (4*(1-st)*(1-st)));
                }
            };

            return [singleSTtoUV(st[0]), singleSTtoUV(st[1])];
        };

        var UVToST = function(uv) {
            var singleUVtoST = function(uv) {
                if (uv >= 0) {
                    return 0.5 * Math.sqrt (1 + 3*uv);
                } else {
                    return 1 - 0.5 * Math.sqrt (1 - 3*uv);
                }
            };

            return [singleUVtoST(uv[0]), singleUVtoST(uv[1])];
        };

        var STToIJ = function(st,order) {
            var maxSize = (1<<order);

            var singleSTtoIJ = function(st) {
                var ij = Math.floor(st * maxSize);
                return Math.max(0, Math.min(maxSize-1, ij));
            };

            return [singleSTtoIJ(st[0]), singleSTtoIJ(st[1])];
        };

        var IJToST = function(ij,order,offsets) {
            var maxSize = (1<<order);

            return [
                (ij[0]+offsets[0])/maxSize,
                (ij[1]+offsets[1])/maxSize
            ];
        };

        // hilbert space-filling curve
        // based on http://blog.notdot.net/2009/11/Damn-Cool-Algorithms-Spatial-indexing-with-Quadtrees-and-Hilbert-Curves
        // note: rather then calculating the final integer hilbert position, we just return the list of quads
        // this ensures no precision issues whth large orders (S3 cell IDs use up to 30), and is more
        // convenient for pulling out the individual bits as needed later
        var pointToHilbertQuadList = function(x,y,order) {
            var hilbertMap = {
                'a': [ [0,'d'], [1,'a'], [3,'b'], [2,'a'] ],
                'b': [ [2,'b'], [1,'b'], [3,'a'], [0,'c'] ],
                'c': [ [2,'c'], [3,'d'], [1,'c'], [0,'b'] ],
                'd': [ [0,'a'], [3,'c'], [1,'d'], [2,'d'] ]
            };

            var currentSquare='a';
            var positions = [];

            for (var i=order-1; i>=0; i--) {

                var mask = 1<<i;

                var quad_x = x&mask ? 1 : 0;
                var quad_y = y&mask ? 1 : 0;

                var t = hilbertMap[currentSquare][quad_x*2+quad_y];

                positions.push(t[0]);

                currentSquare = t[1];
            }

            return positions;
        };

        // S2Cell class

        S2.S2Cell = function(){};

        //static method to construct
        S2.S2Cell.FromLatLng = function(latLng,level) {

            var xyz = LatLngToXYZ(latLng);

            var faceuv = XYZToFaceUV(xyz);
            var st = UVToST(faceuv[1]);

            var ij = STToIJ(st,level);

            return S2.S2Cell.FromFaceIJ (faceuv[0], ij, level);
        };

        S2.S2Cell.FromFaceIJ = function(face,ij,level) {
            var cell = new S2.S2Cell();
            cell.face = face;
            cell.ij = ij;
            cell.level = level;

            return cell;
        };


        S2.S2Cell.prototype.toString = function() {
            return 'F'+this.face+'ij['+this.ij[0]+','+this.ij[1]+']@'+this.level;
        };

        S2.S2Cell.prototype.getLatLng = function() {
            var st = IJToST(this.ij,this.level, [0.5,0.5]);
            var uv = STToUV(st);
            var xyz = FaceUVToXYZ(this.face, uv);

            return XYZToLatLng(xyz);
        };

        S2.S2Cell.prototype.getCornerLatLngs = function() {
            var result = [];
            var offsets = [
                [ 0.0, 0.0 ],
                [ 0.0, 1.0 ],
                [ 1.0, 1.0 ],
                [ 1.0, 0.0 ]
            ];

            for (var i=0; i<4; i++) {
                var st = IJToST(this.ij, this.level, offsets[i]);
                var uv = STToUV(st);
                var xyz = FaceUVToXYZ(this.face, uv);

                result.push ( XYZToLatLng(xyz) );
            }
            return result;
        };


        S2.S2Cell.prototype.getFaceAndQuads = function() {
            var quads = pointToHilbertQuadList(this.ij[0], this.ij[1], this.level);

            return [this.face,quads];
        };

        S2.S2Cell.prototype.getNeighbors = function() {

            var fromFaceIJWrap = function(face,ij,level) {
                var maxSize = (1<<level);
                if (ij[0]>=0 && ij[1]>=0 && ij[0]<maxSize && ij[1]<maxSize) {
                    // no wrapping out of bounds
                    return S2.S2Cell.FromFaceIJ(face,ij,level);
                } else {
                    // the new i,j are out of range.
                    // with the assumption that they're only a little past the borders we can just take the points as
                    // just beyond the cube face, project to XYZ, then re-create FaceUV from the XYZ vector

                    var st = IJToST(ij,level,[0.5,0.5]);
                    var uv = STToUV(st);
                    var xyz = FaceUVToXYZ(face,uv);
                    var faceuv = XYZToFaceUV(xyz);
                    face = faceuv[0];
                    uv = faceuv[1];
                    st = UVToST(uv);
                    ij = STToIJ(st,level);
                    return S2.S2Cell.FromFaceIJ (face, ij, level);
                }
            };

            var face = this.face;
            var i = this.ij[0];
            var j = this.ij[1];
            var level = this.level;


            return [
                fromFaceIJWrap(face, [i-1,j], level),
                fromFaceIJWrap(face, [i,j-1], level),
                fromFaceIJWrap(face, [i+1,j], level),
                fromFaceIJWrap(face, [i,j+1], level)
            ];

        };

        var zeroPad = function(num, digit) {
            var rval = num;
            for (var i=1; i<digit; i++) {
                rval = "0" + rval;
            }
            return rval;
        };

        var FACE_NAMES = [ 'AF', 'AS', 'NR', 'PA', 'AM', 'ST' ];
        var CODE_WORDS = [
            'ALPHA',    'BRAVO',   'CHARLIE', 'DELTA',
            'ECHO',     'FOXTROT', 'GOLF',    'HOTEL',
            'JULIET',   'KILO',    'LIMA',    'MIKE',
            'NOVEMBER', 'PAPA',    'ROMEO',   'SIERRA',
        ];

        // This regexp is quite forgiving. Dashes are allowed between all components, each dash and leading zero is optional.
        // All whitespace is removed in onSearch(). If the first or both the first and second component are omitted, they are
        // replaced with the current cell's coordinates (=the cell which contains the center point of the map). If the last
        // component is ommited, the 4x4 cell group is used.
        var REGEXP = new RegExp('^(?:(?:(' + FACE_NAMES.join('|') + ')-?)?((?:1[0-6])|(?:0?[1-9]))-?)?(' +
                                CODE_WORDS.join('|') + ')(?:-?((?:1[0-5])|(?:0?\\d)))?$', 'i');

        var regionName = function(cell) {
            // ingress does some odd things with the naming. for some faces, the i and j coords are flipped when converting
            // (and not only the names - but the full quad coords too!). easiest fix is to create a temporary cell with the coords
            // swapped
            if (cell.face == 1 || cell.face == 3 || cell.face == 5) {
                cell = S2.S2Cell.FromFaceIJ ( cell.face, [cell.ij[1], cell.ij[0]], cell.level );
            }

            // first component of the name is the face
            var name = FACE_NAMES[cell.face];

            if (cell.level >= 4) {
                // next two components are from the most signifitant four bits of the cell I/J
                var regionI = cell.ij[0] >> (cell.level-4);
                var regionJ = cell.ij[1] >> (cell.level-4);

                name += zeroPad(regionI+1,2)+'-'+CODE_WORDS[regionJ];
            }

            if (cell.level >= 6) {
                // the final component is based on the hibbert curve for the relevant cell
                var facequads = cell.getFaceAndQuads();
                var number = facequads[1][4]*4+facequads[1][5];

                name += '-'+zeroPad(number,2);
            }


            return name;
        };

        var drawCell = function(cell) {
            //TODO: move to function - then call for all cells on screen

            // corner points
            var corners = cell.getCornerLatLngs();

            // center point
            var center = cell.getLatLng();

            // name
            var name = regionName(cell);
            var color = 'Black';
            var weight = 1;
            if (cell.level == 19) {
                color = 'Orange';
            }
            if (cell.level == 17) {
                color = '#FF50CF';
            }
            if (cell.level == 14) {
                color = 'Red';
                weight = 2;
            }

            var coordinates = [];
            for (var i=0; i<corners.length; i++) {
                coordinates.push(corners[i].toJSON());
            }
            var path = L.polyline(coordinates, {color: color, weight: weight});
            path.addTo(map);
            window.plugin.cellline.pathArray.push(path);
        };

        var fn_update = function() {
            for (var i=0; i<window.plugin.cellline.pathArray.length; i++) {
                map.removeLayer(window.plugin.cellline.pathArray[i]);
            }
            window.plugin.cellline.pathArray = [];

            var boundsVal = map.getBounds();
            var bounds = {
                south: boundsVal.getSouthWest().lat,
                west: boundsVal.getSouthWest().lng,
                north: boundsVal.getNorthEast().lat,
                east: boundsVal.getNorthEast().lng
            };

            var seenCells = {};

            var drawCellAndNeighbors = function(cell) {
                var cellStr = cell.toString();

                if (!seenCells[cellStr]) {
                    // cell not visited - flag it as visited now
                    seenCells[cellStr] = true;

                    // is it on the screen?
                    var corners = cell.getCornerLatLngs();
                    var cellBounds = new google.maps.LatLngBounds().extend(corners[2]).extend(corners[3]);

                    if (cellBounds.intersects(bounds)) {
                        // on screen - draw it
                        drawCell(cell);

                        // and recurse to our neighbors
                        var neighbors = cell.getNeighbors();
                        for (var i=0; i<neighbors.length; i++) {
                            drawCellAndNeighbors(neighbors[i]);
                        }
                    }
                }
            };

            // centre cell
            var zoom = map.getZoom();
            //alert("zoom_level=" + zoom);
            var maxzoom = 16;
            // make both cells...
            var cell19 = S2.S2Cell.FromLatLng ( {lat: map.getCenter().lat, lng: map.getCenter().lng }, 19 );
            var cell17 = S2.S2Cell.FromLatLng ( {lat: map.getCenter().lat, lng: map.getCenter().lng }, 17 );
            var cell14 = S2.S2Cell.FromLatLng ( {lat: map.getCenter().lat, lng: map.getCenter().lng }, 14 );
            //var cell6 = S2.S2Cell.FromLatLng ( {lat: map.getCenter().lat, lng: map.getCenter().lng }, 6 );
            if (zoom >= 18) {
                // only draw 19's when we are close in
                //drawCellAndNeighbors(cell19);
            }
            if (zoom >= 16) {
                // only draw 17's when we are close in
                drawCellAndNeighbors(cell17);
            }
            if (zoom >= 13) {
                drawCellAndNeighbors(cell14);
            }
            if (zoom <= 10)
            {
                if(zoom >=6)
                {
                    //drawCellAndNeighbors(cell6);
                }
            }
        }

        map.on('moveend', function() {
            fn_update();
        });

        map.on('zoomend', function() {
            fn_update();
        });

        fn_update();
    };

    var setup = function() {
        setTimeout(function() {window.plugin.cellline.showCell();}, 1000);

    };
    setup.info = plugin_info; //add the script info data to the function as a property
    if(!window.bootPlugins) window.bootPlugins = [];
    window.bootPlugins.push(setup);
    // if IITC has already booted, immediately run the 'setup' function
    if(window.iitcLoaded && typeof setup === 'function') setup();
} // wrapper end
// inject code into site context
var script = document.createElement('script');
var info = {};
if (typeof GM_info !== 'undefined' && GM_info && GM_info.script) info.script = { version: GM_info.script.version, name: GM_info.script.name, description: GM_info.script.description };
script.appendChild(document.createTextNode('('+ wrapper +')('+JSON.stringify(info)+');'));
(document.body || document.head || document.documentElement).appendChild(script);
