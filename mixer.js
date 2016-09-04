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
var debug = require('debug')('adsb-hub.hub');
var ADSBParser = require('./adsb');
var input = require('./input');
var output = require('./output');

var inputs = [
	{ type: 'server', port: 30005, id: 'haakon2' },
	{ type: 'client', port: 30005, host: '192.168.10.109',  id: 'haakon' },
	{ type: 'client', port: 40005, host: '195.159.183.162', id: 'thomas'  }
];

var outputs = [
	{ type: 'server', port: 40005, format: 'BEASTA', id: 'Beast ASCII'  },
	{ type: 'server', port: 40006, format: 'AVRA',   id: 'AVR ASCII'    },
	{ type: 'server', port: 40007, format: 'BEAST',  id: 'Beast binary' }
];

for (var i = 0; i < inputs.length; ++i) {
	(function (i) {
		inputs[i].planes = {};
		inputs[i].parser  = new ADSBParser();
		inputs[i].handler = new input(inputs[i]);
		inputs[i].handler.on('log', console.log);
		inputs[i].handler.on('packet', function (packet) {
			for (var x = 0; x < outputs.length; ++x) {
				outputs[x].handler.write(packet);
			}

			if (packet.buffer.length) {
				var data = inputs[i].parser.parseADSB(packet);
				if (data) {
					if (data.type == 'identification') {
						if (inputs[i].planes[data.ICAO] === undefined) {
							inputs[i].planes[data.ICAO] = { ICAO: data.ICAO };
						}
						inputs[i].planes[data.ICAO].name = data.name;
						inputs[i].planes[data.ICAO].ts = new Date().getTime();
						inputs[i].planes[data.ICAO].sig = packet.sig;
					}
					if (data.type == 'position') {
						if (inputs[i].planes[data.ICAO] === undefined) {
							inputs[i].planes[data.ICAO] = { ICAO: data.ICAO };
						}
						inputs[i].planes[data.ICAO].position = data.position;
						inputs[i].planes[data.ICAO].ts = new Date().getTime();
						inputs[i].planes[data.ICAO].sig = packet.sig;
					}
				}
			}
		});
	})(i);
}

for (var i = 0; i < outputs.length; ++i) {
	outputs[i].handler = new output(outputs[i]);
	outputs[i].handler.on('log', console.log);
}

setInterval(function () {
	var planes = {};

	for (var i = 0; i < inputs.length; ++i) {
		for (var icao in inputs[i].planes) {
			var plane = inputs[i].planes[icao];

			if (plane.ts && plane.ts + 15000 < new Date().getTime()) {
				delete inputs[i].planes[icao];
				continue;
			}

			if (plane.ICAO === undefined) {
				break;
			}

			if (planes[plane.ICAO] === undefined) {
				planes[plane.ICAO] = {
					users: []
				};
			}

			planes[plane.ICAO].users.push(inputs[i].id);

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
	process.stdout.write("\033[H\033[2J");
	console.log(planes);
}, 1000);
