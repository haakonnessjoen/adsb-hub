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
var debug   = require('debug')('adsb-hub.hub');
var ADSBParser = require('./adsb');
var input   = require('./input');
var output  = require('./output');
var Getopt  = require('node-getopt');
var cluster = require('cluster');


var inputs = [
	{ type: 'server', port: 3005, id: 'haakon' },
	{ type: 'server', port: 3006, id: 'jorn' },
	{ type: 'server', port: 3007, id: 'bugge' },
	{ type: 'server', port: 3007, id: 'jacob' },
	{ type: 'client', port: 40005, host: '193.69.248.67', id: 'thomas'  }
];

var outputs = [
	{ type: 'server', port: 30005, format: 'BEAST', id: 'Beast for VirtualRadar'  }
];


if (cluster.isMaster) {

	for (var i = 0; i < inputs.length; ++i) {
		(function (i) {
			cluster.fork({ type: 'input', input_id: i });
		})(i);
	}

	for (var i = 0; i < outputs.length; ++i) {
		(function (i) {
			cluster.fork({ type: 'output', output_id: i });
		})(i);
	}

	cluster.on('exit', function (worker) {

	    // Replace the dead worker, TODO
	    console.log('Worker %d died :(', worker.id);
	});

} else {
	var redis = require("redis");
	var redisclient = redis.createClient();

	var type = process.env.type;

	if (type == 'input') {
		var i = process.env.input_id;
		console.log('Worker %d running for input %d (%s)', cluster.worker.id, i, inputs[i].id);

		inputs[i].planes = {};
		inputs[i].handler = new input(inputs[i]);
		inputs[i].handler.on('log', console.log);
		inputs[i].handler.on('packet', function (packet) {
			if (packet.buffer.length) {
				var data = JSON.stringify({ agent: inputs[i].id, buffer: Array.from(new Uint16Array(packet.buffer)), sig: packet.sig, mlat: packet.mlat, type: packet.type });
				redisclient.rpush('adsb', data);
				redisclient.publish('adsb', data);
			}
		});
	} else if (type == 'output') {
		var i = process.env.output_id;
		console.log('Worker %d running for output %d (%s)', cluster.worker.id, i, outputs[i].id);

		outputs[i].handler = new output(outputs[i]);
		outputs[i].handler.on('log', console.log);

		redisclient.subscribe('adsb');
		redisclient.on('message', function (chan, result) {
			try {
				var packet = JSON.parse(result);


				packet.buffer = new Buffer(packet.buffer);
				outputs[i].handler.write(packet);
			} catch (e) {
				console.log("Parse error: ", e);
			}
		});
	} else {
		console.log("Unknown worker spawned: ", process.env);
	}
}
