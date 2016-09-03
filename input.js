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
	self.settings = settings;

	if (settings.type == 'server') {
		self.emit('log', 'Input' + self.settings.type + ' ' + self.settings.id + ' - Listening on ' + settings.host + ':' + settings.port);
		self.handle = new tcp.Server(settings.host || '0.0.0.0', settings.port, function (socket) {

			self.handleConnection(socket, self.handle);

		});
		self.handle.on('log', function (message) {
			self.emit('log', 'Input' + self.settings.type + ' ' + self.settings.id + ' - ' + message);
			console.log('Input' + self.settings.type + ' ' + self.settings.id + ' - ' + message);
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
}
util.inherits(input, EventEmitter);

input.prototype.handleConnection = function (socket, handle) {
	var self = this;
	socket.transport = new transport();

	if (self.settings.format) {
		socket.transport.setFormat(self.settings.format);
	}

	socket.transport.on('log', function (message) {
		self.emit('log', 'Input' + self.settings.type + ' ' + self.settings.id + ' - ' + message);
	});
	socket.transport.on('error', function (type) {
		if (type == 'format') {
			socket.end();
		}
	});

	socket.databuf = new Buffer(0);
	socket.on('data', function (data) {
		socket.databuf = Buffer.concat([socket.databuf, data]);
		
		var packet;
		do {
			packet = socket.transport.getADSB(socket.databuf);

			if (packet && packet.buffer.length) {
					self.emit('packet', packet);
			}
			if (packet) {
				socket.databuf = packet.remain;
			}
		} while (packet !== undefined && packet.buffer.length > 0);
	});
};

module.exports = exports = input;
