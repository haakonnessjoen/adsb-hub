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

function output(settings) {
	var self = this;
	self.settings = settings;

	self.id = self.id || '';
	settings.host = settings.host || '0.0.0.0';
	self.connections = [];

	setImmediate(function () {
		if (settings.type == 'server') {
			self.emit('log', 'Output' + self.settings.type + ' ' + self.settings.id + ' - Listening on ' + settings.host + ':' + settings.port);
			self.handle = new tcp.Server(settings.host || '0.0.0.0', settings.port, function (socket) {

				self.handleConnection(socket, self.handle);

			});
			self.handle.on('log', function (message) {
				self.emit('log', 'Output' + self.settings.type + ' ' + self.settings.id + ' - ' + message);
			});

		} else if (settings.type == 'client') {
			self.emit('log', 'Output' + self.settings.type + ' ' + self.settings.id + ' - Connecting to ' + settings.host + ':' + settings.port);
			self.handle = new tcp.Client(settings.host, settings.port, function (socket) {

				self.handleConnection(socket, self.handle);

			});
			self.handle.on('log', function (message) {
				self.emit('log', 'Output' + self.settings.type + ' ' + self.settings.id + ' - ' + message);
			});

		} else {
			throw new Error('Unknown type: "' + settings.type + '", should be "client" or "server"');
		}
	});
}
util.inherits(output, EventEmitter);

output.prototype.write = function (data) {
	var self = this;

	if (data && data.buffer && data.buffer.length) {
		for (var i = 0; i < self.connections.length; ++i) {
			try {
				var packet = self.connections[i].transport.writeADSB(data);
				self.connections[i].write(packet);
			} catch (e) {
				self.emit('log', 'Output' + self.settings.type + ' ' + self.settings.id + ' - Socket error: ' + e);
			}
		}
	}
};

output.prototype.handleConnection = function (socket, handle) {
	var self = this;
	socket.transport = new transport();

	if (self.settings.format) {
		socket.transport.setFormat(self.settings.format);
	}

	self.connections.push(socket);

	socket.on('end', function () {
		var idx = self.connections.indexOf(socket);
		if (idx != -1) {
			self.connections.splice(idx, 1);
		}
	});

	socket.transport.on('error', function (type) {
		if (type == 'format') {
			socket.end();
		}
	});

	socket.on('data', function (data) {});
};

module.exports = exports = output;
