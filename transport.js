module.exports = exports = transport;
var debug = require('debug')('adsb-hub.transport');
var bits = require('./bits');

function transport() {
	this.format = 'UNKNOWN';

}

transport.prototype.probeInput = function (buf) {
	var firstB = buf.readUInt8(0);
	var firstC = String.fromCharCode(firstB);

	if (firstC == '*') {
		this.format = 'AVR-A';
		return true;
	} else
	if (firstC == '@') {
		this.format = 'BEAST-A';
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
			throw new Error('Error probing input format. Please select manually with setFormat()');
			return;
		}
	}

	return this['parse' + this.format].call(this, buffer);
}

// Read and calculate BEAST packet length
function beastRead(buf, want) {
	if (buf.length < want) {
		return { readbytes: 0, buffer: new Buffer(0) };
	}

	var result = new Buffer(want*2);
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

transport.prototype.writeBEAST = function (packet, buffer) {

};

transport.prototype.parseBEAST = function (buffer) {
	if (buffer.length < 11) return undefined;
	var result = {};

	if (buffer.readUInt8(0) == 0x1a && buffer.readUInt8(1) != 0x1a) {

		var extra = parseMLAT(buffer);
		result.mlat = extra.mlat;
		result.sig = extra.sig;

		var type = String.fromCharCode(buffer.readUInt8(1));
		var read;

		if (type == '1') {         // MODE A-C
			read = beastRead(buffer, 11);
		} else if (type == '2') { // MODE S Short
			read = beastRead(buffer, 16);
		} else if (type == '3') { // Mode S Long
			read = beastRead(buffer, 23);
		} else {
			debug('Unknown mode: ' + type + ' (' + databuf.readUInt8(1) + ')');
			return undefined;
		}

		if (read.readbytes == 0) {
			return undefined;
		}

		result.buffer = new Buffer(read.buffer.slice(9));
		result.remain = buffer.slice(read.readbytes);

		return result;
	}
}
