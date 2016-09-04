$(function () {
	var socket = io();

	socket.on('planes', function (planes) {
		for (var icao in planes) {
			var plane = planes[icao];
			var $tr;

			if ($('#plane_' + icao).length == 0) {
				$tr = $('<tr><td class=icao></td><td class=regnr></td><td class=spot></td><td class=act></td><td></td></tr>');
				$tr.attr('id', 'plane_' + icao);
				$tr.find('.icao').text(icao);
				$('#current_planes tbody').append($tr);
			} else {
				$tr = $('#plane_' + icao);
			}
			if (plane.name) {
				$tr.find('.regnr').text(plane.name);
			}
			if (plane.users) {
				$tr.find('.spot').text(plane.users.join(', '));
			}
			if (plane.ts) {
				$tr.find('.act').text(Math.floor((new Date().getTime() - plane.ts) / 1000));
			}
		}
	});
});
