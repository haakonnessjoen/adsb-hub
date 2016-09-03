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
var reconnect = require('reconnect-net');
var net = require('net');
var EventEmitter = require('events').EventEmitter;
var util = require('util');

function Client(ip, port, cb) {
	var self = this;

	var handle = reconnect(function (socket) {
		self.emit('log', '(' + ip + ':' + port + ') Connected');
		cb(socket);
	}).connect(port, ip);
	
	handle.on('reconnect', function (attempts, delay) {
		self.emit('reconnect', attempts, delay);
		self.emit('log', '(' + ip + ':' + port + ') Reconnect attempt ' + attempts + '. Waited ' + delay + ' ms');
	});
	handle.on('error', function (err) {
		self.emit('log', '(' + ip + ':' + port + ') Socket error: ' + err);
	});
	handle.on('disconnect', function (err) {
		self.emit('disconnect', err, handle);
		self.emit('log', '(' + ip + ':' + port + ') Disconnected');
	});
}
util.inherits(Client, EventEmitter);

function Server(ip, port, cb) {
	var self = this;

	var handle = net.createServer(function (socket) {
		self.emit('log', '(' + socket.remoteAddress + ':' + socket.remotePort + ') Connected');
	
		socket.on('error', function (err) {
			self.emit('log', '(' + socket.remoteAddress + ':' + socket.remotePort + ') Socket error: ' + err);
		});
		socket.on('close', function (err) {
			self.emit('disconnect', err, socket);
			self.emit('log', '(' + socket.remoteAddress + ':' + socket.remotePort + ') Disconnected');
		});

	  cb(socket);
	});
	handle.listen(port, ip);

	handle.on('error', function (err) {
		self.emit('error', err, handle);
	});
}
util.inherits(Server, EventEmitter);
var tcp = {
	Client: Client,
	Server: Server
};
module.exports = exports = tcp;
