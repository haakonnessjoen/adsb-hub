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
var redis = require("redis");
var ADSBParser = new (require('./adsb'))();
var express = require('express');
var http    = require('http');
var app     = express();
var Getopt  = require('node-getopt');
var web     = require('./web')(app);
//var tes = new (require('tes'))('adsb.haakon.priv');

var opts = new Getopt([
		['p', 'port=ARG', 'port number for webserver'],
		['h', 'help', 'display this help']
]).bindHelp().parseSystem();

var port = opts.options['port'] || 8080;

console.log("Webserver listening on port " + port);
var server  = app.listen(port);
var io   = require('socket.io').listen(server);

app.use(express.static(__dirname + '/public'));

var redisclient = redis.createClient();

var inputs = {};

function pop() {
	redisclient.blpop('adsb', 0, function (err, info) {
		var message = info[1];
		try {
			var packet = JSON.parse(message);
			var agent = packet.agent;

			packet.buffer = new Buffer(packet.buffer);
			var data = ADSBParser.parseADSB(packet);
			if (data) {
				if (inputs[agent] === undefined) {
					inputs[agent] = { agent: agent, planes: {} };
				}
				if (inputs[agent].planes[data.ICAO] !== undefined) {
					inputs[agent].planes[data.ICAO].msgs++;
				}
				if (data.type == 'identification') {
					if (inputs[agent].planes[data.ICAO] === undefined) {
						inputs[agent].planes[data.ICAO] = { ICAO: data.ICAO, msgs: 0 };
					}
					inputs[agent].planes[data.ICAO].name = data.name;
					inputs[agent].planes[data.ICAO].ts = new Date().getTime();
					inputs[agent].planes[data.ICAO].sig = packet.sig;
				}
				if (data.type == 'position') {
					if (inputs[agent].planes[data.ICAO] === undefined) {
						inputs[agent].planes[data.ICAO] = { ICAO: data.ICAO, msgs: 0 };
					}
					inputs[agent].planes[data.ICAO].position = data.position;
					inputs[agent].planes[data.ICAO].ts = new Date().getTime();
					inputs[agent].planes[data.ICAO].sig = packet.sig;
				}
			}
		} catch (e) {
			console.log("Parse error: ", e);
		}
		setImmediate(pop);
	});
}
pop();

var positions = {};
var planes = {};

setInterval(function () {
	var planes = {};

	for (var input in inputs) {
		for (var icao in inputs[input].planes) {
			var plane = inputs[input].planes[icao];

			if (plane.ts && plane.ts + 15000 < new Date().getTime()) {
				delete inputs[input].planes[icao];
				continue;
			}

			if (plane.ICAO === undefined) {
				break;
			}

			if (planes[plane.ICAO] === undefined) {
				planes[plane.ICAO] = {
					users: [],
					msgs: 0
				};
			}

			planes[plane.ICAO].msgs += plane.msgs;

			planes[plane.ICAO].users.push(inputs[input].agent);

			if (planes[plane.ICAO].ts === undefined || plane.ts > planes[plane.ICAO].ts) {
				planes[plane.ICAO].ts = plane.ts;
				if (plane.name) {
					planes[plane.ICAO].name = plane.name;
				}
				if (plane.position) {
					planes[plane.ICAO].position = plane.position;
				}
				if (plane.sig) {
					planes[plane.ICAO].sig = plane.sig;
				}
			}
		}
	}
	io.emit('planes', planes);
	//tes.publish('planes', planes);
}, 1000);
