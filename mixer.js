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
var debug = require('debug')('adsb-hub.main');
var net = require('net');
var transport = require('./transport');
var ADSBParser = require('./adsb');

var inputs = [
//		{ type: 'server', port: 30005, id: 'haakon' },
    { type: 'client', port: 30005, host: '10.20.30.119', id: 'haakon2' },
   { type: 'client', port: 40005, host: '195.159.183.162', id: 'thomas' }
];

var outputs = [
	{ type: 'server', port: 40005, format: 'BEASTA' },
	{ type: 'server', port: 40006, format: 'BEAST' }
];

function handleInputSocket(socket, obj) {
	var socket = socket || this;
	socket.transport = new transport();
	socket.parser    = new ADSBParser();
	socket.databuf   = new Buffer(0);

	socket.on('data', function (data) {
		socket.databuf = Buffer.concat([socket.databuf, data]);

		var data;
		do {
			data = socket.transport.getADSB(socket.databuf);
//			console.log(obj.id + ": Got packet", data);

			if (data)
			for (var i = 0; i < outputs.length; ++i) {
				if (outputs[i].clients !== undefined) {
					for (var x = 0; x < outputs[i].clients.length; ++x) {
						var client = outputs[i].clients[x];

						try {
//							console.log("Trying to send to connected output");
							if (client.transport !== undefined) {
//								console.log("Writing");
								var buf = client.transport.writeADSB(data);
								client.write(buf);
							}
						} catch (e) {

						}
					}
				}
			}

			if (data) {
				socket.databuf = data.remain;
			}
		} while (data !== undefined);
	});
}

function createOutputServer(obj) {
	console.log("Create output server");
	if (obj.clients === undefined) {
		obj.clients = [];
	}
	console.log("output ready on port " + obj.port);
	obj.server = net.createServer(function (socket) {
		console.log("output client connected " + obj.port);
		obj.clients.push(socket);

		socket.transport = new transport();
		socket.transport.setFormat(obj.format);

		socket.on('error', function (e) { console.log(e); });
		socket.on('end', function () {
			console.log("output client disconnected " + obj.port);
			var idx = obj.clients.indexOf(socket);
			if (idx != -1) {
				obj.clients.splice(idx, 1);
			}
		});
	}).listen(obj.port).on('error', function (e) { console.log('listener:', e); });
}

function createInputServer(obj) {
	obj.server = net.createServer(function (socket) {
		console.log("New input client:" + obj.id);

		handleInputSocket(socket, obj);
	}).listen(obj.port);
	console.log(obj.id + " listening on port " + obj.port);
}

function checkConn(obj) {
	if (!obj.socket || !obj.socket.connected) {
		console.log(obj.id + " connecting to " + obj.host);
		obj.socket = net.createConnection(obj.port, obj.host, function () {
			console.log("Client connected: " + obj.id);

			handleInputSocket(obj.socket, obj);
		}).on('error', function () {
			delete obj.socket;
		});
	}
}

function createInputClient(obj) {
	setInterval(function () {
		checkConn(obj);
	}, 10000);
	checkConn(obj);
}

for (var i = 0; i < inputs.length; ++i) {
	if (inputs[i].type == 'server') {
		createInputServer(inputs[i]);
	} else {
		createInputClient(inputs[i]);
	}
}

for (var i = 0; i < outputs.length; ++i) {
	console.log("Output " + i + ": ", outputs[i]);
	if (outputs[i].type == 'server') {
		createOutputServer(outputs[i]);
	}
}
