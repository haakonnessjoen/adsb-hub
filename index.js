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

var positions = {};
var planes = {};

client = net.connect(30005, '10.20.30.119', function () {
	debug("Connected");

	client.transport = new transport();
	client.parser    = new ADSBParser();
	client.databuf = new Buffer(0);
});


client.on('data', function (data) {
	client.databuf = Buffer.concat([client.databuf, data]);

	var data;
	do {
		data = client.transport.getADSB(client.databuf);
		if (data) {
			var info = client.parser.parseADSB(data);

			if (info && info.type == 'identification') {
				if (planes[info.ICAO] === undefined) planes[info.ICAO] = {};
				planes[info.ICAO].name = info.name;
			} else if (info && info.type == 'position') {
				if (planes[info.ICAO] === undefined) planes[info.ICAO] = {};
				planes[info.ICAO].position = info.position;
			}

			client.databuf = data.remain;
		}
	} while (data !== undefined);
	process.stdout.write("\033[H\033[2J");
	console.log(planes);
});
