module.exports = exports = parseADSB;
var bits = require('./bits');

function adsbASCII(bits) {
	var data = '';
	var charset = '#ABCDEFGHIJKLMNOPQRSTUVWXYZ#####_###############0123456789######';
	for (var i = 0; i < bits.length; i += 6) {
		data += charset[parseInt(bits.substr(i,6),2)];
	}
	return data.replace(/[#_]/g,'');
}

function cprNL(lat) {
	try {
		var NZ = 15;
		var a = 1 - Math.cos(Math.PI / (2 * NZ));
		var b = Math.pow(Math.cos(Math.PI / 180 * Math.abs(lat)),2);
		var nl = 2 * Math.PI / (Math.acos(1 - a/b));
		var NL = Math.floor(nl);
		return NL;
	} catch (e) {
		return 1;
	}
}

function cprMOD(a,b) {
	var r = a % b;
	if (r < 0)
		r += b;
	return r;
}

function parseADSB(packet) {
	var buf = packet.buffer;
	var sig = packet.sig;

	var data = bits.parseBits(buf, [
		{ name: 'DF',    type: 'num', size: 5 },
		{ name: 'CA',    type: 'num', size: 3 },
		{ name: 'ICAO',  type: 'hex', size: 24 },
		{ name: 'TC',    type: 'num', size: 5 }
	]);

	if (data.DF == 17) {
		if (checker.checker.crc(buf) != checker.checker.checksum(buf)) {
			// Gjør om til Uint8Array, siden buffer.slice ikke gir deg kopi, og modes-crc bruker .slice for å kopiere
			var abuf = Array.prototype.slice.call(buf);
			var result = checker.fixer.fix(abuf);
			if (result.errorBit == -1) {
				return;
			}
			buf = Buffer.from(abuf);
			debug(" === PACKET FIXED! ===");
			parseADSB(buf, sig);
			return;
		}

		// DC 17, TC 1 - 4 = Aircraft Identification
		if (data.TC > 0 && data.TC <= 4) {
			var identification = bits.parseBits(buf, [
				{ name: 'DF',    type: 'num', size: 5 },
				{ name: 'CA',    type: 'num', size: 3 },
				{ name: 'ICAO',  type: 'hex', size: 24 },
				{ name: 'TC',    type: 'num', size: 5 },
				{ name: 'NUL',   type: 'num', size: 3 },
				{ name: 'DATA',  type: 'bin', size: 48 }
			]);
			if (identification.NUL != 0) return;
	
			data.type = 'identification';
			data.name = adsbASCII(identification.DATA);

			return data;
		}

		// DC 17, TC 9 - 18 = Airborne Positions
		if (data.TC >= 9 && data.TC <= 18) {
			var obj = bits.parseBits(buf, [
				{ name: 'DF',    type: 'num', size: 5 },
				{ name: 'CA',    type: 'num', size: 3 },
				{ name: 'ICAO',  type: 'hex', size: 24 },
				{ name: 'TC',    type: 'num', size: 5 },
				{ name: 'SS',    type: 'num', size: 2 },
				{ name: 'NICsb', type: 'num', size: 1 },
				{ name: 'ALT',   type: 'bin', size: 12 },
				{ name: 'T',     type: 'num', size: 1 },
				{ name: 'F',     type: 'num', size: 1 },
				{ name: 'LAT',   type: 'num', size: 17 },
				{ name: 'LON',   type: 'num', size: 17 }
			]);
			if (positions[obj.ICAO] === undefined) positions[obj.ICAO] = {};
			positions[obj.ICAO]['lat' + obj.F] = obj.LAT / 131072;
			positions[obj.ICAO]['lon' + obj.F] = obj.LON / 131072;

			var first = undefined;

			if (obj.F == 1 && positions[obj.ICAO]['lat0']) {
				first = 'E';
			}
			if (obj.F == 0 && positions[obj.ICAO]['lat1']) {
				first = 'O';
			}
			if (first !== undefined) {
				var NZ = 15;
				var latIndex = Math.floor(59 * positions[obj.ICAO]['lat0'] - 60 * positions[obj.ICAO]['lat1'] + 0.5);
				var dLatE = 360/(4*NZ);
				var dLatO = 360/(4*NZ-1);
				var LatE = dLatE * (cprMOD(latIndex, (4*NZ)) + positions[obj.ICAO]['lat0']);
				var LatO = dLatO * (cprMOD(latIndex, (4*NZ-1)) + positions[obj.ICAO]['lat1']);

				if (LatE >= 270)
					LatE = LatE - 360;

				if (LatO >= 270)
					LatO = LatO - 360;

				var Lat = LatE >= LatO ? LatE : LatO;
				if (cprNL(LatE) != cprNL(LatO)) return;

				var Lon;
				if (first == 'O') {
					var ni = Math.max(cprNL(LatE),1);
					var dLon = 360/ni;
					var m = Math.floor(positions[obj.ICAO]['lon0'] * (cprNL(LatE)-1) - positions[obj.ICAO]['lon1'] * cprNL(LatE) + 0.5);
					Lon = dLon * (cprMOD(m, ni) + positions[obj.ICAO]['lon0']);
				} else {
					var ni = Math.max(cprNL(LatO)-1, 1);
					var dLon = 360/ni;
					var m = Math.floor(positions[obj.ICAO]['lon0'] * (cprNL(LatO)-1) - positions[obj.ICAO]['lon1'] * cprNL(LatO) + 0.5);
					Lon = dLon * (cprMOD(m, ni) + positions[obj.ICAO]['lon1']);
				}

				if (Lon >= 180)
					Lon = Lon - 360;

				data.type = 'position';
				data.position = { lat: Lat, lon: Lon };
				return data;
			}
		}
	}

	data.type = 'unknown';
	return data;
}
