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

describe('express-middleware-upload (post-processing)', ()=> {

	var ppHits; // Tracker for when postProcessing has been called

	before('setup server', done => {
		app.use(expressLogger);
		app.use(bodyParser.json());
		app.set('log.indent', '      ');

		app.use('/api/pp/static-path', emu({
			path: tempPath,
			postProcessing: function(req, res) {
				ppHits.push({req, res});
				res.send({status: 'Uploaded Static'});
			},
		}));

		app.use('/api/pp/dynamic-path/:id', emu({
			path: function(req, res, next) {
				next(null, `${tempPath}/${req.params.id}`);
			},
			postProcessing: function(req, res) {
				ppHits.push({req, res});
				res.send({status: 'Uploaded Dynamic'});
			},
		}));

		server = app.listen(port, null, function(err) {
			if (err) return finish(err);
			mlog.log('Server listening on ' + url);
			done();
		});
	});

	after(()=> server.close());

	beforeEach(()=> ppHits = []); // Reset ppHits each time

	it('should post-process a simple file (static path + post processing)', done => {
		superagent.post(url + '/api/pp/static-path')
			.attach('file', __dirname + '/data/jabberwocky.txt')
			.end(function(err, res) {
				expect(err).to.not.be.ok;
				expect(res.status).to.be.equal(200);
				expect(res.body).to.be.an.instanceOf(Object);
				expect(res.body).to.be.deep.equal({status: 'Uploaded Static'});

				expect(ppHits).to.be.ok;
				expect(ppHits).to.have.length(1);
				expect(ppHits[0]).to.have.property('req');
				expect(ppHits[0]).to.have.property('res');
				expect(ppHits[0]).to.have.nested.property('req.files.0.storagePath');
				expect(ppHits[0].req.files[0].storagePath).to.be.a.string;
				expect(ppHits[0].req.files[0].storagePath).to.match(/\/jabberwocky\.txt$/);

				done();
			});
	});

	it('should post-process a simple file (static path + post processing)', done => {
		superagent.post(url + '/api/pp/dynamic-path/321')
			.attach('file', __dirname + '/data/jabberwocky.txt')
			.end(function(err, res) {
				expect(err).to.not.be.ok;
				expect(res.status).to.be.equal(200);
				expect(res.body).to.be.an.instanceOf(Object);
				expect(res.body).to.be.deep.equal({status: 'Uploaded Dynamic'});

				expect(ppHits).to.be.ok;
				expect(ppHits).to.have.length(1);
				expect(ppHits[0]).to.have.property('req');
				expect(ppHits[0]).to.have.property('res');
				expect(ppHits[0]).to.have.nested.property('req.files.0.storagePath');
				expect(ppHits[0].req.files[0].storagePath).to.be.a.string;
				expect(ppHits[0].req.files[0].storagePath).to.match(/\/jabberwocky\.txt$/);

				done();
			});
	});

});
