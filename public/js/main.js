$(function () {
	var socket = io();

	socket.on('planes', function (planes) {
		for (var icao in planes) {
			var plane = planes[icao];
			var $tr;

			if ($('#plane_' + icao).length == 0) {
				$tr = $('<tr><td class=icao></td><td class=regnr></td><td class=spot></td><td class=act></td><td class=msgs></td></tr>');
				$tr.attr('id', 'plane_' + icao);
				$tr.attr('icao', icao);
				$tr.find('.icao').text(icao);
				$('#current_planes tbody').append($tr);
			} else {
				$tr = $('#plane_' + icao);
			}
			if (plane.msgs) {
				$tr.find('.msgs').text(plane.msgs);
			}
			if (plane.name) {
				$tr.find('.regnr').text(plane.name);
				if (plane.position) {
					$tr.find('.regnr').html('<a href="https://www.google.no/maps/search/' + plane.position.lat + ',' + plane.position.lon + '?hl=no">' + plane.name + '</a>');
				}
			}
			if (plane.users) {
				$tr.find('.spot').text(plane.users.join(', '));
			}
			if (plane.ts) {
				$tr.find('.act').text(Math.floor((new Date().getTime() - plane.ts) / 1000));
			}
		}
		$('#current_planes > tbody > tr').each(function (i) {
			if ($(this).attr('icao')) {
				if (planes[$(this).attr('icao')] === undefined) {
					$(this).remove();
				}
			}
		});
	});
});
