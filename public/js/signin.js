$(function () {
	
	jQuery.support.placeholder = false;
	test = document.createElement('input');
	if('placeholder' in test) jQuery.support.placeholder = true;
	
	if (!$.support.placeholder) {
		
		$('.field').find ('label').show ();
		
	}
	
	$('#login').submit(function (e) {
		e.preventDefault();

		/*
		$.ajax('/login', {
			method: 'POST',
			data: { 'username': '123' }
		}).done(function (result) {
			console.log("Result:", result);
		});
		*/
		window.location.href = '/main.html';

		return false;
	});
});
