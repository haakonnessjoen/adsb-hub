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
module.exports = exports = {};
var debug = require('debug')('adsb-hub.bits');

exports.hex2bin = function(hex) {
	var result = '';
	for (var i = 0; i < hex.length; i += 2) {
		var bin = parseInt(hex.substr(i,2), 16).toString(2);
		bin = ("00000000"+bin).slice(-8)
		result += bin;
	}
	return result;
};

exports.bin2hex = function (bits) {
	output = '';
	for (var x = Math.ceil(bits.length / 8) - 1; x >= 0; --x) {
		output = parseInt(bits.substr(x * 8, 8), 2).toString(16) + output;
	}
	return output;
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
exports.parseBits = function (buffer, description) {
  bits = exports.hex2bin(buffer.toString('hex'));
	pos = 0;
	var output = {};

	for (var i = 0; i < description.length; ++i) {
		if (pos > bits.length) {
			debug("Error, trying to parse past end of bitstream, pos=" + pos + ", len="+bits.length);
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
};
