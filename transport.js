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
module.exports = exports = transport;
var debug = require('debug')('adsb-hub.transport');
var bits = require('./bits');
var EventEmitter = require('events').EventEmitter;
var util = require('util');

function transport() {
	this.format = 'UNKNOWN';

}
util.inherits(transport, EventEmitter);

transport.prototype.probeInput = function (buf) {
	var firstB = buf.readUInt8(0);
	var firstC = String.fromCharCode(firstB);

	if (firstC == '*') {
		this.format = 'AVRA';
		return true;
	} else
	if (firstC == '@') {
		this.format = 'BEASTA';
		return true;
	} else
	if (firstB == 0x1a) {
		this.format = 'BEAST';
		return true;
	} else {
		this.format = 'UNKNOWN';
		return false;
	}
}

transport.prototype.getADSB = function (buffer) {
	if (this.format == 'UNKNOWN') {
		if (!this.probeInput(buffer)) {
			this.emit('log', 'Error probing input format.');
			this.emit('error', 'format');
			return;
		}
		this.emit('log', 'Recognized input as: ' + this.format);
	}

	return this['parse' + this.format].call(this, buffer);
}

transport.prototype.writeADSB = function (packet) {
	if (this.format == 'UNKNOWN') {
		throw new Error('No output format defined. Please set manually with setFormat()');
		return;
	}

	return this['write' + this.format].call(this, packet);
}

// Read and calculate BEAST packet length
function beastRead(buf, want) {
	if (buf.length < want) {
		return { readbytes: 0, buffer: new Buffer(0) };
	}

	var result = new Buffer(Math.ceil(want*1.3));
	var ii = 0;

	for (var i = 0; i < want; ++i) {
		if (buf[i] == 0x1a && buf[i+1] == 0x1a) {
			want++;
			i++;
			result[ii++] = 0x1a;
		} else {
			result[ii++] = buf[i];
		}
	}

	return { readbytes: want, buffer: result.slice(0, ii) };
}

function parseMLAT(buffer) {
	var data = bits.parseBits(buffer, [
		{ name: 'sig', type: 'num', size: 8 },
		{ name: 'type', type: 'num', size: 8 },
		{ name: 'mlat', type: 'bin', size: 48 }
	]);

	return data;
}

transport.prototype.setFormat = function (format) {
	if (this['parse' + format] === undefined) {
		throw new Error('Unknown transport-format: ' + format);
		return false;
	}

	this.format = format;
	return true;
};

transport.prototype.writeBEASTA = function (packet) {
	if (packet === undefined) return new Buffer(0);
	var data = '@';
	data += ('000000000000' + bits.bin2hex(packet.mlat)).slice(-12);
	data += packet.buffer.toString('hex');
	data += ";\r\n";
	return new Buffer(data, 'utf8');
};

transport.prototype.writeAVRA = function (packet) {
	if (packet === undefined) return new Buffer(0);
	var data = '*';
	data += packet.buffer.toString('hex');
	data += ";\r\n";
	return new Buffer(data, 'utf8');
};

transport.prototype.writeBEAST = function (packet) {
	if (packet === undefined) return new Buffer(0);
	var estimatedLength = 2 + 6 + 1 + packet.buffer.length;
	var buffer = new Buffer(estimatedLength);

	buffer.writeUInt8(0x1a, 0);
	buffer.writeUInt8(packet.type.toString().charCodeAt(0), 1);
	var mlat = new Buffer(('000000000000' + bits.bin2hex(packet.mlat)).slice(-12), 'hex');
	mlat.copy(buffer, 2, 0, 6);
	buffer.writeUInt8(parseInt(packet.sig), 2 + 6);
	packet.buffer.copy(buffer, 2 + 7);

	/* Escape 0x1a */
	var resultBuffer = new Buffer(estimatedLength*2);
	var x = 0;
	for (var i = 0; i < buffer.length; ++i) {
		resultBuffer[x++] = buffer[i];

		if (i != 0 && buffer[i] == 0x1a) {
			resultBuffer[x++] = 0x1a;
		}
	}
	return new Buffer(resultBuffer.slice(0, x));
};

transport.prototype.parseBEASTA = function (buffer) {
	if (buffer.length < 20) return undefined;
	var result = {
		sig: 0
	};

	if (String.fromCharCode(buffer[0]) == '@') {
		result.mlat = bits.hex2bin(buffer.slice(1,13).toString());
		var len = buffer.indexOf(";") + 3;
		if (len == 20) {
			result.type = 1;
		} else if (len == 30) {
			result.type = 2;
		} else if (len == 44) {
			result.type = 3;
		} else if (len == 2) { // no ; was found
			// Need more data
			return undefined;
		} else {
			debug("Invalid packet len: " + len);
			this.emit('log', 'Receiving invalid data. Unknown packet length: ' + len);
			result.buffer = new Buffer(0);
			result.remain = buffer.slice(len);
			return result;
		}
		result.buffer = new Buffer(buffer.slice(13, len - 3).toString(), 'hex');
		result.remain = buffer.slice(len-1);
		return result;
	} else {
		// Out of sync?
		var idx = buffer.indexOf('@', 1);
		if (idx > 0) {
			// Sync up for next parse
			result.buffer = new Buffer(0);
			result.remain = buffer.slice(idx);
			this.emit('log', 'Data stream out of sync, trying to resync.');
			debug('Trying to sync up to next @');
			return result;
		} else {
			// need more data
			return undefined;
		}
	}
};

transport.prototype.parseAVRA = function (buffer) {
	if (buffer.length < 20) return undefined;
	var result = {
		sig: 0,
		mlat: '0'.repeat(48)
	};

	if (String.fromCharCode(buffer[0]) == '*') {
		var len = buffer.indexOf(";") + 3;
		if (len == 8) {
			result.type = 1;
		} else if (len == 18) {
			result.type = 2;
		} else if (len == 32) {
			result.type = 3;
		} else if (len == 2) { // no ; was found
			// Need more data
			return undefined;
		} else {
			debug("Invalid packet len: " + len);
			this.emit('log', 'Receiving invalid data. Unknown packet length: ' + len);
			result.buffer = new Buffer(0);
			result.remain = buffer.slice(len);
			return result;
		}
		result.buffer = new Buffer(buffer.slice(1, len - 3).toString(), 'hex');
		result.remain = buffer.slice(len-1);
		return result;
	} else {
		// Out of sync?
		var idx = buffer.indexOf('*', 1);
		if (idx > 0) {
			// Sync up for next parse
			result.buffer = new Buffer(0);
			result.remain = buffer.slice(idx);
			debug('Trying to sync up to next *');
			this.emit('log', 'Data stream out of sync, trying to resync.');
			return result;
		} else {
			// need more data
			return undefined;
		}
	}
};

transport.prototype.parseBEAST = function (buffer) {
	if (buffer.length < 11) return undefined;
	var result = {};

	if (buffer.readUInt8(0) == 0x1a && buffer.readUInt8(1) != 0x1a) {

		var extra = parseMLAT(buffer);
		result.mlat = extra.mlat;
		result.sig = extra.sig;
		result.type = parseInt(String.fromCharCode(extra.type));
		var read;

		if (result.type == 1) {         // MODE A-C
			read = beastRead(buffer, 11);
		} else if (result.type == 2) { // MODE S Short
			read = beastRead(buffer, 16);
		} else if (result.type == 3) { // Mode S Long
			read = beastRead(buffer, 23);
		} else {
			console.log("Need more data, UKNOWN MODE " + type);
			debug('Unknown mode: ' + type + ' (' + databuf.readUInt8(1) + ')');
			this.emit('log', 'Receiving invalid data. Unknown mode: ' + databuf.readUInt8(1));
			// Make parser find next "sync point"
			result.buffer = new Buffer(0);
			result.remain = buffer.slice(1);
			return undefined;
		}

		if (read.readbytes == 0) {
			console.log("Need more data, beastread = 0");
			// need more data
			return undefined;
		}

		result.buffer = read.buffer.slice(9); //new Buffer(read.buffer.slice(9));
		result.remain = buffer.slice(read.readbytes);

		return result;
	} else {
		// Out of sync?
		var idx = buffer.indexOf(0x1a, 2, 'binary');
		if (idx > 0) {
			// Sync up for next parse
			result.buffer = new Buffer(0);
			result.remain = buffer.slice(idx);
			debug('Trying to sync up to next 0x1a');
			console.log("Out of sync, trying to skip to next 0x1a");
			this.emit('log', 'Data stream out of sync, trying to resync.');
			return result;
		} else {
			console.log("Did not find any 0x1a, need more data");
			// need more data
			return undefined;
		}
	}
}
