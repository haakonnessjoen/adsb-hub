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
var tcp = require('./tcp');
var transport = require('./transport');
var EventEmitter = require('events').EventEmitter;
var util = require('util');

function input(settings) {
	var self = this;
	self.buffers = [];
	self.settings = settings;

	settings.host = settings.host !== undefined ? settings.host : '0.0.0.0';

	setImmediate(function () {
		if (settings.type == 'server') {
			self.emit('log', 'Input' + self.settings.type + ' ' + self.settings.id + ' - Listening on ' + settings.host + ':' + settings.port);
			self.handle = new tcp.Server(settings.host || '0.0.0.0', settings.port, function (socket) {

				self.handleConnection(socket, self.handle);

			});
			self.handle.on('log', function (message) {
				self.emit('log', 'Input' + self.settings.type + ' ' + self.settings.id + ' - ' + message);
			});

		} else if (settings.type == 'client') {
			self.emit('log', 'Input' + self.settings.type + ' ' + self.settings.id + ' - Connecting to ' + settings.host + ':' + settings.port);
			self.handle = new tcp.Client(settings.host, settings.port, function (socket) {

				self.handleConnection(socket, self.handle);

			});
			self.handle.on('log', function (message) {
				self.emit('log', 'Input' + self.settings.type + ' ' + self.settings.id + ' - ' + message);
			});

		} else {
			throw new Error('Unknown type: "' + settings.type + '", should be "client" or "server"');
		}
	});
}
util.inherits(input, EventEmitter);

input.prototype.handleConnection = function (socket, handle) {
	var self = this;
	socket.transport = new transport();

	if (self.settings.format) {
		socket.transport.setFormat(self.settings.format);
	}

	socket.on('end', function () {
		if (socket._timer) {
			clearInterval(socket._timer);
		}
	});

	socket.transport.on('error', function (type) {
		if (type == 'format') {
			socket.end();
		}
	});

	socket.databuf = new Buffer(0);
	socket.on('data', function (data) {
		//console.log("Got " + data.length + " bytes of data");
		self.buffers.push(data);
	});
	socket._timer = setInterval(function () {
		var len = self.buffers.length;
		for (var i = 0; i < Math.min(len, 10); ++i) {
			self.handlePackets(socket);
		}
	}, 10);
};

input.prototype.handlePackets = function (socket) {
	var self = this;
	var buffer = this.buffers.shift();
	var packet;

	if (buffer === undefined) {
		return;
	}
	var startlen = buffer.length;
	//console.log("Parse packet of size:", buffer.length);
	packet = socket.transport.getADSB(buffer);

	if (packet && packet.buffer.length) {
		//console.log("Successfully parsed " + packet.buffer.length);
		self.emit('packet', packet);
	}
	if (packet) {
		//console.log("Bytes was remaining: ", packet.remain.length);
		buffer = packet.remain;
		if (buffer.length > 0) {
			self.buffers.unshift(buffer);
		}
	}
	if (buffer.length == 0) {
		//console.log("No more data yet");
	} else if (startlen == buffer.length) {
		//console.log("Waiting for more data");
		if (self.buffers.length > 0) {
			var newbuf = Buffer.concat([buffer, self.buffers.shift()]);
			console.log("CONCATING " + buffer.length + " + " + (newbuf.length - buffer.length));
			self.buffers.unshift(newbuf);
		}
	}
	//console.log("BUFFER LEN: ", self.buffers.length);
};

module.exports = exports = input;
