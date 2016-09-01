/*
    adsb-hub - A ADS-B Hub for communities
    Copyright (C) 2016 Håkon Nessjøen <haakon.nessjoen@gmail.com>

    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation; either version 2 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License along
    with this program; if not, write to the Free Software Foundation, Inc.,
    51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.

*/
var checker = require('modes-crc');
var net = require('net');

client = net.connect(30005, '10.20.30.119', function () {
	console.log("Connected");
});
var databuf = new Buffer(0);

client.on('data', function (data) {
	databuf = Buffer.concat([databuf, data]);

	parseBuffer();
});

function buflen(offset, want) {
	if (databuf.length < want) {
		return -1;
	}
	for (var i = offset; i < want; ++i) {
		if (databuf.readUInt8(i) == 0x1a && databuf.readUInt8(i+1) == 0x1a) {
			want++;
			i++;
		}
	}
	return want;
}

function hex2bin(hex) {
	var result = '';
	for (var i = 0; i < hex.length; i += 2) {
		var bin = parseInt(hex.substr(i,2), 16).toString(2);
		bin = ("00000000"+bin).slice(-8)
		result += bin;
	}
	return result;
}

function adsbASCII(bits) {
	var data = '';
	var charset = '#ABCDEFGHIJKLMNOPQRSTUVWXYZ#####_###############0123456789######';
	for (var i = 0; i < bits.length; i += 6) {
		data += charset[parseInt(bits.substr(i,6),2)];
	}
	return data.replace(/[#_]/g,'');
}

/*
 * Tar imot buffer, gjør om til bits, og lager et objekt med keys etter ønsket antall bits.
 *
 *	var data = parseBits(buf, [
 *		{ name: 'DF',    type: 'num', size: 5 },
 *		{ name: 'CA',    type: 'num', size: 3 },
 *		{ name: 'ICAO',  type: 'hex', size: 24 },
 *		{ name: 'TC',    type: 'bin', size: 5 }
 *	]);
 */
function parseBits(buffer, description) {
  bits = hex2bin(buffer.toString('hex'));
	pos = 0;
	var output = {};
	for (var i = 0; i < description.length; ++i) {
		if (pos > bits.length) {
			console.log("Error, trying to parse past end of bitstream, pos=" + pos + ", len="+bits.length);
			return output;
		}
		var desc = description[i];
		if (desc.type == 'num') {
			output[desc.name] = parseInt(bits.substr(pos, desc.size), 2);
		} else
		if (desc.type == 'hex') {
			output[desc.name] = '';
			for (var x = Math.ceil(desc.size/8)-1; x >= 0; x--) {
				output[desc.name] = parseInt(bits.substr(pos+(x*8),8),2).toString(16) + output[desc.name];
			}
		} else
	  if (desc.type == 'bin') {
			output[desc.name] = bits.substr(pos, desc.size);
		}
		pos += desc.size;
	}
	return output;
}

var positions = {};

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

var planes = {};

function parseADSB(buf, sig) {
	var data = parseBits(buf, [
		{ name: 'DF',    type: 'num', size: 5 },
		{ name: 'CA',    type: 'num', size: 3 },
		{ name: 'ICAO',  type: 'hex', size: 24 },
		{ name: 'TC',    type: 'num', size: 5 }
	]);

	if (data.DF == 17) {
		if (checker.checker.crc(buf) != checker.checker.checksum(buf)) {
			return;
		}
		if (data.TC > 0 && data.TC <= 4) {
			var identification = parseBits(buf, [
				{ name: 'DF',    type: 'num', size: 5 },
				{ name: 'CA',    type: 'num', size: 3 },
				{ name: 'ICAO',  type: 'hex', size: 24 },
				{ name: 'TC',    type: 'num', size: 5 },
				{ name: 'NUL',   type: 'num', size: 3 },
				{ name: 'DATA',  type: 'bin', size: 48 }
			]);
			if (identification.NUL != 0) return;
	
			if (planes[data.ICAO] === undefined) {
				planes[data.ICAO] = {};
			}
			planes[data.ICAO].sig = sig;
			planes[data.ICAO].name = adsbASCII(identification.DATA);
			console.log("SIG: 0x" + sig.toString(16) + " ICAO24: ", identification.ICAO, " Name: " + planes[data.ICAO].name);
		}
		if (data.TC >= 9 && data.TC <= 18) {
			var obj = parseBits(buf, [
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

				positions[obj.ICAO] = {};

				if (planes[data.ICAO] === undefined) {
					planes[data.ICAO] = {};
				}
				planes[data.ICAO].sig = sig;
				planes[data.ICAO].position = { lat: Lat, lon: Lon };
				console.log("Pos: ", planes[data.ICAO].position);
			}
		}
	}
}

function parseBuffer() {
	if (databuf.length < 2) return;

	if (databuf.readUInt8(0) == 0x1a && databuf.readUInt8(1) != 0x1a) {
		if (databuf.readUInt8(1) == '1'.charCodeAt(0)) {
			var datalen = buflen(2, 11);
			if (datalen == -1) return;
			console.log("MODE A-C: sig " + databuf.readUInt8(7));
			databuf = databuf.slice(datalen);
		} else
		if (databuf.readUInt8(1) == '2'.charCodeAt(0)) {
			var datalen = buflen(2, 16);
			if (datalen == -1) return;
		//	console.log("MODE S short: sig " + databuf.readUInt8(7));

			databuf = databuf.slice(datalen);
		} else
		if (databuf.readUInt8(1) == '3'.charCodeAt(0)) {
			var datalen = buflen(2, 23);
			if (datalen == -1) return;
			//console.log("MODE S long: sig " + databuf.readUInt8(7));
			parseADSB(databuf.slice(9,23), databuf.readUInt8(7));

//			console.log("\033[H\033[2J");
	//		console.log(planes);
			databuf = databuf.slice(datalen);
		} else {
			console.log("Unknown mode: " + databuf.readUInt8(1));
		}
	} else {
		databuf = databuf.slice(1);
		console.log("Input misaligned, trying to align..");
	}
	if (databuf.length) {
		parseBuffer();
	}
}
