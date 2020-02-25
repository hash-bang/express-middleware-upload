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
var tempPath = temp.path({prefix: 'emu-', suffix: '.test.tmp'});

describe('express-middleware-upload (constraints)', ()=> {

	before('setup server', done => {
		app.use(expressLogger);
		app.use(bodyParser.json());
		app.set('log.indent', '      ');

		app.use('/api/files/:path?', emu({
			path: tempPath,
			expect: 2,
			limit: 3
		}));

		server = app.listen(port, null, function(err) {
			if (err) return finish(err);
			mlog.log('Server listening on ' + url);
			done();
		});
	});

	after(()=> server.close());

	it('should accept file upload within expect/limit', done => {
		superagent.post(url + '/api/files')
			.attach('file', __dirname + '/data/jabberwocky.txt')
			.attach('file', __dirname + '/data/jabberwocky.txt')
			.end(function(err, res) {
				expect(err).to.not.be.ok;
				expect(res.status).to.be.equal(200);
				done();
			});
	});

	it('should reject more than file limit', done => {
		superagent.post(url + '/api/files')
			.attach('file', __dirname + '/data/jabberwocky.txt')
			.attach('file', __dirname + '/data/jabberwocky.txt')
			.attach('file', __dirname + '/data/jabberwocky.txt')
			.attach('file', __dirname + '/data/jabberwocky.txt')
			.end(function(err, res) {
				expect(err).to.be.ok;
				expect(err).to.have.property('message');
				expect(res.error.text).to.equal('More than file limit uploaded')
				expect(res.status).to.be.equal(400);
				done();
			});
	});

	it('should reject less than file expect', done => {
		superagent.post(url + '/api/files')
			.attach('file', __dirname + '/data/jabberwocky.txt')
			.end(function(err, res) {
				expect(err).to.be.ok;
				expect(err).to.have.property('message');
				expect(res.error.text).to.equal('Less than expected files uploaded')
				expect(res.status).to.be.equal(400);
				done();
			});
	});


});
