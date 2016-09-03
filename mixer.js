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
		{ type: 'server', port: 30005, id: 'haakon' },
  //  { type: 'client', port: 1234, host: '127.0.0.1', id: 'haakon2' },
   { type: 'client', port: 40005, host: '195.159.183.162', id: 'thomas' }
];

var outputs = [
	{ type: 'server', port: 40005, format: 'BEASTA' },
	{ type: 'server', port: 40006, format: 'AVRA' },
	{ type: 'server', port: 40007, format: 'BEAST' }
];

for (var i = 0; i < inputs.length; ++i) {
	inputs[i].handler = new input(inputs[i]);
	inputs[i].handler.on('log', console.log);
	inputs[i].handler.on('packet', function (packet) {
		for (var i = 0; i < outputs.length; ++i) {
			outputs[i].handler.write(packet);
		}
	});
}

for (var i = 0; i < outputs.length; ++i) {
	outputs[i].handler = new output(outputs[i]);
	outputs[i].handler.on('log', console.log);
}
