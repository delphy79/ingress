setTimeout(function() {fn_init();}, 100);

function setupHeader() {
    var upgradesProfile = document.getElementById("upgrades-profile-icon");
    if (upgradesProfile != undefined) {
	    var progress = upgradesProfile.getAttribute("value");

	    var progressElem = document.createElement("div");
	    progressElem.innerText = progress + "%";

	    var profileElem = document.getElementsByClassName("inner-container")[1];

	    profileElem.insertBefore(progressElem, profileElem.children[0]);
	}
}

function fn_init() {
    //var low_quality_modal = document.getElementById("low-quality-modal");
    //if (low_quality_modal != null) return;
    
    setupHeader();
    
    var w = typeof unsafeWindow === 'undefined' ? window : unsafeWindow;
    w.$scope = element => w.angular.element(element).scope();

    var timeElem;
    var lowDistCircle, longDistCirle;

    var S2 = w.S2 = { L: {} };

    S2.L.LatLng = function (/*Number*/ rawLat, /*Number*/ rawLng, /*Boolean*/ noWrap) {
        var lat = parseFloat(rawLat, 10);
        var lng = parseFloat(rawLng, 10);

        if (isNaN(lat) || isNaN(lng)) {
            throw new Error('Invalid LatLng object: (' + rawLat + ', ' + rawLng + ')');
        }

        if (noWrap !== true) {
            lat = Math.max(Math.min(lat, 90), -90);
            lng = (lng + 180) % 360 + ((lng < -180 || lng === 180) ? 180 : -180);
        }

        return { lat: lat, lng: lng };
    };

    S2.L.LatLng.DEG_TO_RAD = Math.PI / 180;
    S2.L.LatLng.RAD_TO_DEG = 180 / Math.PI;

    S2.LatLngToXYZ = function(latLng) {
        var d2r = S2.L.LatLng.DEG_TO_RAD;

        var phi = latLng.lat*d2r;
        var theta = latLng.lng*d2r;

        var cosphi = Math.cos(phi);

        return [Math.cos(theta)*cosphi, Math.sin(theta)*cosphi, Math.sin(phi)];
    };

    S2.XYZToLatLng = function(xyz) {
        var r2d = S2.L.LatLng.RAD_TO_DEG;

        var lat = Math.atan2(xyz[2], Math.sqrt(xyz[0]*xyz[0]+xyz[1]*xyz[1]));
        var lng = Math.atan2(xyz[1], xyz[0]);

        return S2.L.LatLng(lat*r2d, lng*r2d);
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
            default: throw {error: 'Invalid face'};
        }

        return [u,v];
    };

    S2.XYZToFaceUV = function(xyz) {
        var face = largestAbsComponent(xyz);

        if (xyz[face] < 0) {
            face += 3;
        }

        var uv = faceXYZToUV (face,xyz);

        return [face, uv];
    };

    S2.FaceUVToXYZ = function(face,uv) {
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

    var singleSTtoUV = function(st) {
        if (st >= 0.5) {
            return (1/3.0) * (4*st*st - 1);
        } else {
            return (1/3.0) * (1 - (4*(1-st)*(1-st)));
        }
    };

    S2.STToUV = function(st) {
        return [singleSTtoUV(st[0]), singleSTtoUV(st[1])];
    };

    var singleUVtoST = function(uv) {
        if (uv >= 0) {
            return 0.5 * Math.sqrt (1 + 3*uv);
        } else {
            return 1 - 0.5 * Math.sqrt (1 - 3*uv);
        }
    };

    S2.UVToST = function(uv) {
        return [singleUVtoST(uv[0]), singleUVtoST(uv[1])];
    };

    S2.STToIJ = function(st,order) {
        var maxSize = (1<<order);

        var singleSTtoIJ = function(st) {
            var ij = Math.floor(st * maxSize);
            return Math.max(0, Math.min(maxSize-1, ij));
        };

        return [singleSTtoIJ(st[0]), singleSTtoIJ(st[1])];
    };

    S2.IJToST = function(ij,order,offsets) {
        var maxSize = (1<<order);

        return [
            (ij[0]+offsets[0])/maxSize,
            (ij[1]+offsets[1])/maxSize
        ];
    };

    var rotateAndFlipQuadrant = function(n, point, rx, ry) {
        var newX, newY;
        if (ry == 0) {
            if (rx == 1) {
                point.x = n - 1 - point.x;
                point.y = n - 1 - point.y;
            }

            var x = point.x;
            point.x = point.y
            point.y = x;
        }
    }

    var pointToHilbertQuadList = function(x,y,order,face) {
        var hilbertMap = {
            'a': [ [0,'d'], [1,'a'], [3,'b'], [2,'a'] ],
            'b': [ [2,'b'], [1,'b'], [3,'a'], [0,'c'] ],
            'c': [ [2,'c'], [3,'d'], [1,'c'], [0,'b'] ],
            'd': [ [0,'a'], [3,'c'], [1,'d'], [2,'d'] ]
        };

        if ('number' !== typeof face) {
            console.warn(new Error("called pointToHilbertQuadList without face value, defaulting to '0'").stack);
        }
        var currentSquare = (face % 2) ? 'd' : 'a';
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

    S2.S2Cell = function(){};

    S2.S2Cell.FromHilbertQuadKey = function(hilbertQuadkey) {
        var parts = hilbertQuadkey.split('/');
        var face = parseInt(parts[0]);
        var position = parts[1];
        var maxLevel = position.length;
        var point = {
            x : 0,
            y: 0
        };
        var i;
        var level;
        var bit;
        var rx, ry;
        var val;

        for (i = maxLevel - 1; i >= 0; i--) {
            level = maxLevel - i;
            bit = position[i];
            rx = 0;
            ry = 0;
            if (bit === '1') {
                ry = 1;
            } else if (bit === '2') {
                rx = 1;
                ry = 1;
            } else if (bit === '3') {
                rx = 1;
            }

            val = Math.pow(2, level - 1);
            rotateAndFlipQuadrant(val, point, rx, ry);

            point.x += val * rx;
            point.y += val * ry;
        }

        if (face % 2 === 1) {
            var t = point.x;
            point.x = point.y;
            point.y = t;
        }

        return S2.S2Cell.FromFaceIJ(parseInt(face), [point.x, point.y], level);
    };

    S2.S2Cell.FromLatLng = function(latLng, level) {
        if ((!latLng.lat && latLng.lat !== 0) || (!latLng.lng && latLng.lng !== 0)) {
            throw new Error("Pass { lat: lat, lng: lng } to S2.S2Cell.FromLatLng");
        }
        var xyz = S2.LatLngToXYZ(latLng);

        var faceuv = S2.XYZToFaceUV(xyz);
        var st = S2.UVToST(faceuv[1]);

        var ij = S2.STToIJ(st,level);

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
        var st = S2.IJToST(this.ij,this.level, [0.5,0.5]);
        var uv = S2.STToUV(st);
        var xyz = S2.FaceUVToXYZ(this.face, uv);

        return S2.XYZToLatLng(xyz);
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
            var st = S2.IJToST(this.ij, this.level, offsets[i]);
            var uv = S2.STToUV(st);
            var xyz = S2.FaceUVToXYZ(this.face, uv);

            result.push ( S2.XYZToLatLng(xyz) );
        }
        return result;
    };

    S2.S2Cell.prototype.getFaceAndQuads = function () {
        var quads = pointToHilbertQuadList(this.ij[0], this.ij[1], this.level, this.face);

        return [this.face,quads];
    };

    S2.S2Cell.prototype.toHilbertQuadkey = function () {
        var quads = pointToHilbertQuadList(this.ij[0], this.ij[1], this.level, this.face);

        return this.face.toString(10) + '/' + quads.join('');
    };

    S2.latLngToNeighborKeys = S2.S2Cell.latLngToNeighborKeys = function (lat, lng, level) {
        return S2.S2Cell.FromLatLng({ lat: lat, lng: lng }, level).getNeighbors().map(function (cell) {
            return cell.toHilbertQuadkey();
        });
    };

    S2.S2Cell.prototype.getNeighbors = function() {
        var fromFaceIJWrap = function(face,ij,level) {
            var maxSize = (1<<level);
            if (ij[0]>=0 && ij[1]>=0 && ij[0]<maxSize && ij[1]<maxSize) {
                return S2.S2Cell.FromFaceIJ(face,ij,level);
            } else {
                var st = S2.IJToST(ij,level,[0.5,0.5]);
                var uv = S2.STToUV(st);
                var xyz = S2.FaceUVToXYZ(face,uv);
                var faceuv = S2.XYZToFaceUV(xyz);
                face = faceuv[0];
                uv = faceuv[1];
                st = S2.UVToST(uv);
                ij = S2.STToIJ(st,level);
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

    S2.FACE_BITS = 3;
    S2.MAX_LEVEL = 30;
    S2.POS_BITS = (2 * S2.MAX_LEVEL) + 1;

    S2.facePosLevelToId = S2.S2Cell.facePosLevelToId = S2.fromFacePosLevel = function (faceN, posS, levelN) {
        var Long = w.dcodeIO && w.dcodeIO.Long || require('long');
        var faceB;
        var posB;
        var bin;

        if (!levelN) {
            levelN = posS.length;
        }
        if (posS.length > levelN) {
            posS = posS.substr(0, levelN);
        }

        faceB = Long.fromString(faceN.toString(10), true, 10).toString(2);
        while (faceB.length < S2.FACE_BITS) {
            faceB = '0' + faceB;
        }

        posB = Long.fromString(posS, true, 4).toString(2);
        while (posB.length < (2 * levelN)) {
            posB = '0' + posB;
        }

        bin = faceB + posB;
        bin += '1';
        while (bin.length < (S2.FACE_BITS + S2.POS_BITS)) {
            bin += '0';
        }

        return Long.fromString(bin, true, 2).toString(10);
    };

    S2.keyToId
        = S2.S2Cell.keyToId
        = S2.toId
        = S2.toCellId
        = S2.fromKey
        = function (key) {
        var parts = key.split('/');

        return S2.fromFacePosLevel(parts[0], parts[1], parts[1].length);
    };

    S2.idToKey
        = S2.S2Cell.idToKey
        = S2.S2Cell.toKey = S2.toKey
        = S2.fromId = S2.fromCellId
        = S2.S2Cell.toHilbertQuadkey
        = S2.toHilbertQuadkey
        = function (idS) {
        var Long = w.dcodeIO && w.dcodeIO.Long || require('long');
        var bin = Long.fromString(idS, true, 10).toString(2);

        while (bin.length < (S2.FACE_BITS + S2.POS_BITS)) {
            bin = '0' + bin;
        }

        var lsbIndex = bin.lastIndexOf('1');

        var faceB = bin.substring(0, 3);

        var posB = bin.substring(3, lsbIndex);
        var levelN = posB.length / 2;

        var faceS = Long.fromString(faceB, true, 2).toString(10);
        var posS = Long.fromString(posB, true, 2).toString(4);

        while (posS.length < levelN) {
            posS = '0' + posS;
        }

        return faceS + '/' + posS;
    };

    S2.keyToLatLng = S2.S2Cell.keyToLatLng = function (key) {
        var cell2 = S2.S2Cell.FromHilbertQuadKey(key);
        return cell2.getLatLng();
    };

    S2.idToLatLng = S2.S2Cell.idToLatLng = function (id) {
        var key = S2.idToKey(id);
        return S2.keyToLatLng(key);
    };

    S2.S2Cell.latLngToKey
        = S2.latLngToKey
        = S2.latLngToQuadkey
        = function (lat, lng, level) {
        if (isNaN(level) || level < 1 || level > 30) {
            throw new Error("'level' is not a number between 1 and 30 (but it should be)");
        }

        return S2.S2Cell.FromLatLng({ lat: lat, lng: lng }, level).toHilbertQuadkey();
    };

    S2.stepKey = function (key, num) {
        var Long = w.dcodeIO && w.dcodeIO.Long || require('long');
        var parts = key.split('/');

        var faceS = parts[0];
        var posS = parts[1];
        var level = parts[1].length;

        var posL = Long.fromString(posS, true, 4);

        var otherL;
        if (num > 0) {
            otherL = posL.add(Math.abs(num));
        } else if (num < 0) {
            otherL = posL.subtract(Math.abs(num));
        }
        var otherS = otherL.toString(4);

        if ('0' === otherS) {
            console.warning(new Error("face/position wrapping is not yet supported"));
        }

        while (otherS.length < level) {
            otherS = '0' + otherS;
        }

        return faceS + '/' + otherS;
    };

    S2.S2Cell.prevKey = S2.prevKey = function (key) {
        return S2.stepKey(key, -1);
    };

    S2.S2Cell.nextKey = S2.nextKey = function (key) {
        return S2.stepKey(key, 1);
    };
	
    function createTimer(subctrl) {
	    var header = document.getElementsByClassName("niantic-wayfarer-logo")[0];
	    var headerTimer = document.createElement("div");
	    headerTimer.innerText = "";
	    headerTimer.setAttribute("style", "display: inline-block; margin-left: 5em; text-align: right;");
	    timeElem = document.createElement("div");
	    timeElem.innerText = "??:??";
	    timeElem.setAttribute("style", "display: inline-block;");
	    headerTimer.appendChild(timeElem);
	    header.parentNode.appendChild(headerTimer);
	    
	    updateTimer(subctrl);
    }

    function updateTimer(subctrl) {
	    var tDiff = subctrl.pageData.expires - Date.now();
        
	    if (tDiff > 0){
	        var tDiffMin = Math.floor(tDiff/1000/60);
	        var tDiffSec = Math.ceil(tDiff/1000 - 60*tDiffMin);
            timeElem.innerText = pad(tDiffMin,2) + ":" + pad(tDiffSec,2);
	        //Retrigger function in 1 second
	        setTimeout(function() { updateTimer(subctrl); }, 1000);
	    } else {
	        timeElem.innerText = "EXPIRED!";
	        timeElem.setAttribute("style", "color: red;");
	    }
    }

    function pad(num, size) {
	    var s = num + "";
	    while (s.length < size) s = "0" + s;
	    return s;
    }
    
    function checkNearby(subctrl, obj1, obj2) {
        var d = distance(subctrl.pageData.lat, subctrl.pageData.lng, subctrl.pageData.nearbyPortals[0].lat, subctrl.pageData.nearbyPortals[0].lng);
        if (d < 20) {
            if (obj1 != undefined || obj1 != null) obj1.innerHTML +=  "<font style='color: red'>&nbsp;Too Close</font>";
            if (obj2 != undefined || obj2 != null) obj2.innerHTML +=  "<font style='color: red'>&nbsp;Too Close</font>";
        }
    }

    function distance(lat1, lon1, lat2, lon2) {
        if ((lat1 == lat2) && (lon1 == lon2)) {
            return 0;
        } else {
            var radlat1 = Math.PI * lat1/180;
            var radlat2 = Math.PI * lat2/180;
            var theta = lon1-lon2;
            var radtheta = Math.PI * theta/180;
            var dist = Math.sin(radlat1) * Math.sin(radlat2) + Math.cos(radlat1) * Math.cos(radlat2) * Math.cos(radtheta);
            if (dist > 1) {
                dist = 1;
            }
            dist = Math.acos(dist);
            dist = dist * 180/Math.PI;
            dist = dist * 60 * 1.1515;

            dist = dist * 1609.344
            return dist;
        }
    }

    function addS2(map, lat, lng, lvl) {
        var cell = window.S2.S2Cell.FromLatLng({lat: lat, lng: lng}, lvl);

        var cellCorners = cell.getCornerLatLngs();
        cellCorners[4] = cellCorners[0]; //Loop it

        var polyline = new google.maps.Polyline({
            path: cellCorners,
            geodesic: true,
            fillColor: 'grey',
            fillOpacity: 0.2,
            strokeColor: '#00FF00',
            strokeOpacity: 1.0,
            strokeWeight: 1,
            map: map
        });
    }
	
    function addLowestDistCircle(subctrl, gMap, hook = false){ 
        var latLng = new google.maps.LatLng(subctrl.pageData.lat, subctrl.pageData.lng);
	    var c = new google.maps.Circle({
            map: gMap,
            center: latLng,
            radius: 20,
            strokeColor: 'red',
            fillColor: 'red',
            strokeOpacity: 0.8,
            strokeWeight: 1,
            fillOpacity: 0.2
  	    });
	    if (hook) lowDistCircle = c;
    }

    var answerHeader1 = document.getElementsByClassName("answer-header")[0].getElementsByTagName("DIV")[0].getElementsByTagName("H3")[0].getElementsByTagName("SPAN")[0];
    var answerHeader2 = document.getElementsByClassName("answer-header")[0].getElementsByTagName("DIV")[0].getElementsByTagName("H3")[0].getElementsByTagName("SPAN")[1];
    var NewSubmissionController = w.document.getElementById('NewSubmissionController');
    var subCtrl = null;
	try {
		subCtrl = w.$scope(NewSubmissionController).subCtrl;
	} catch (e) {
		fn_init();
		return;
	}

    var pageDateInterval = setInterval(function() {
        if (subCtrl.pageData != undefined) {
            clearInterval(pageDateInterval);
	        
	        createTimer(subCtrl);

            if (subCtrl.pageData.nearbyPortals.length > 0) checkNearby(subCtrl, answerHeader1, answerHeader2);
            
            addS2(subCtrl.map, subCtrl.pageData.lat, subCtrl.pageData.lng, 17);
            addS2(subCtrl.map2, subCtrl.pageData.lat, subCtrl.pageData.lng, 17);
			
            addLowestDistCircle(subCtrl, subCtrl.map);
            addLowestDistCircle(subCtrl, subCtrl.map2, true);
            
            if (subCtrl.pageData.locationEdits) {
		        var editMarkers = w.$scope(NewSubmissionController).getAllLocationMarkers();
		        for (var i=0; i<editMarkers.length; i++) {
                    if (editMarkers[i].position.lat() == subCtrl.pageData.lat
		                && editMarkers[i].position.lng() == subCtrl.pageData.lng) {
		                editMarkers[i].setIcon("https://t1.daumcdn.net/localimg/localimages/07/mapapidoc/markerStar.png");
		            }
                }
	        }
            
            var geocoder = new google.maps.Geocoder;
            geocoder.geocode({'location': {lat: parseFloat(subCtrl.pageData.lat), lng: parseFloat(subCtrl.pageData.lng)}}, function(results, status) {
                if (status === 'OK') {
                    if (results[0]) {
                        var formatted_address = results[0].formatted_address;
                        formatted_address = encodeURI(formatted_address).replace("%EB%8C%80%ED%95%9C%EB%AF%BC%EA%B5%AD", "");
                        if (answerHeader1 != undefined || answerHeader1 != null) answerHeader1.innerHTML += "<br><font style='color: red; font-size: 15px;'>"+decodeURI(formatted_address)+"</font>";
                        if (answerHeader2 != undefined || answerHeader2 != null) answerHeader2.innerHTML += "<br><font style='color: red; font-size: 15px;'>"+decodeURI(formatted_address)+"</font>";
                    }
                }
            });
            
	    var topBtn = document.createElement('button');
	    topBtn.setAttribute("style", "z-index: 9999; position: absolute; left: 0em; top: 90%; background-color: #000; color: #fff; opacity: 0.5;");
	    topBtn.onclick = function() {
		//document.getElementById("content-container").scrollIntoView({behavior: "smooth", block: "start", inline: "nearest"});
		document.getElementById("content-container").scrollTop = 0;
	    };
	    var topBtnText = document.createTextNode('Top');
	    topBtn.appendChild(topBtnText);
	    document.body.appendChild(topBtn);
        }
    }, 100);
}
