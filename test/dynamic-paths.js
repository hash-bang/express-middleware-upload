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

describe('express-middleware-upload (dynamic options.path)', ()=> {

	before('setup server', done => {
		app.use(expressLogger);
		app.use(bodyParser.json());
		app.set('log.indent', '      ');

		app.use('/api/assets/:id/:path?', emu({
			path: function(req, res, next) {
				next(null, `${tempPath}/${req.params.id}`);
			},
		}));

		server = app.listen(port, null, function(err) {
			if (err) return finish(err);
			mlog.log('Server listening on ' + url);
			done();
		});
	});

	after(()=> server.close());

	it('should accept a file upload', done => {
		superagent.post(url + '/api/assets/123')
			.attach('file', __dirname + '/data/jabberwocky.txt')
			.end(function(err, res) {
				expect(err).to.not.be.ok;
				expect(res.status).to.be.equal(200);
				done();
			});
	});

	it('should list the uploaded files', done => {
		superagent.get(url + '/api/assets/123')
			.end(function(err, res) {
				expect(err).to.not.be.ok;
				expect(res.status).to.be.equal(200);
				expect(res.body).to.be.an.instanceOf(Array);
				expect(res.body).to.have.length(1);

				expect(res.body[0]).to.have.property('name', 'jabberwocky.txt');
				expect(res.body[0]).to.have.property('ext', 'txt');
				expect(res.body[0]).to.have.property('size', 965);
				expect(res.body[0]).to.have.property('created');

				done();
			});
	});

	it('should be able to read an uploaded file', done => {
		superagent.get(url + '/api/assets/123/jabberwocky.txt')
			.end(function(err, res) {
				expect(err).to.not.be.ok;
				expect(res.status).to.be.equal(200);
				expect(res).to.have.property('text');
				expect(res.text).to.have.length.above(500);
				expect(res.text).to.contain('slithy toves');

				done();
			});
	});

	it('should be able to delete an uploaded file', done => {
		superagent.delete(url + '/api/assets/123/jabberwocky.txt')
			.end(function(err, res) {
				expect(err).to.not.be.ok;
				expect(res.status).to.be.equal(200);

				done();
			});
	});

	it('should have deleted the uploaded files', done => {
		superagent.get(url + '/api/assets/123')
			.end(function(err, res) {
				expect(err).to.not.be.ok;
				expect(res.status).to.be.equal(200);
				expect(res.text).to.equal('[]');

				done();
			});
	});

});
