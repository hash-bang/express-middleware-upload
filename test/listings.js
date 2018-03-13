var bodyParser = require('body-parser');
var emu = require('..');
var expect = require('chai').expect;
var express = require('express');
var expressLogger = require('express-log-url');
var mlog = require('mocha-logger');
var superagent = require('superagent');
var temp = require('temp');

var app = express();
var server;
var port = 8181;
var url = 'http://localhost:' + port;

describe('express-middleware-upload (file listings)', ()=> {

	before('setup server', done => {
		app.use(expressLogger);
		app.use(bodyParser.json());
		app.set('log.indent', '      ');

		app.use('/api/files/:path?', emu({
			path: `${__dirname}/data`,
			post: false,
			delete: false,
		}));

		server = app.listen(port, null, function(err) {
			if (err) return finish(err);
			mlog.log('Server listening on ' + url);
			done();
		});
	});

	after(()=> server.close());

	it('should deny a file upload', done => {
		superagent.post(url + '/api/files')
			.attach('file', __dirname + '/data/jabberwocky.txt')
			.end(function(err, res) {
				expect(err).to.be.ok;
				expect(res.status).to.be.equal(403);
				done();
			});
	});

	it('should list available files', done => {
		superagent.get(url + '/api/files')
			.end(function(err, res) {
				expect(err).to.not.be.ok;
				expect(res.status).to.be.equal(200);
				expect(res.body).to.be.an.instanceOf(Array);
				expect(res.body).to.have.length(2);

				expect(res.body[0]).to.have.property('name');
				expect(res.body[0].name).to.match(/^hideous.*\.txt$/);
				expect(res.body[0].name).to.not.match(/#/); // Hashes should not be carried in the filename - it should be escaped
				expect(res.body[0]).to.have.property('ext', 'txt');
				expect(res.body[0]).to.have.property('size', 7);
				expect(res.body[0]).to.have.property('created');

				expect(res.body[1]).to.have.property('name', 'jabberwocky.txt');
				expect(res.body[1]).to.have.property('ext', 'txt');
				expect(res.body[1]).to.have.property('size', 965);
				expect(res.body[1]).to.have.property('created');


				done();
			});
	});

	it('should be able to read a file', done => {
		superagent.get(url + '/api/files/jabberwocky.txt')
			.end(function(err, res) {
				expect(err).to.not.be.ok;
				expect(res.status).to.be.equal(200);
				expect(res).to.have.property('text');
				expect(res.text).to.have.length.above(500);
				expect(res.text).to.contain('slithy toves');

				done();
			});
	});

	it('should not be able to delete a file', done => {
		superagent.delete(url + '/api/files/jabberwocky.txt')
			.end(function(err, res) {
				expect(err).to.be.ok;
				expect(res.status).to.be.equal(403);

				done();
			});
	});

});
