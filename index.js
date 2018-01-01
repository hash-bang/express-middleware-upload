/**
* Middleware factory to deal with file CRUD (listings, uploads, reads and deletes)
* @param {Object} options Options to use when generating the middleware
* @param {string|function} options.path The path (relative to emu.defaults.basePath) to store files in. Prefix slash is optional but recommended for readability
* @param {string} [options.basePath] Prefix automatically prepended onto options.path (this is seperate so it can be set globally to your application root via `emu.defaults.basePath`)
* @param {function} [options.errorHandler] How to output errors. This should be a function called as (req, res, statusCode, message)
* @param {string} [options.postPath='upload'] How to name the uploaded file. 'upload' = Use the uploaded filename appended to options.path, 'param' = Use the path specified in `req.params.path` (implies `options.limit=1`), 'dir' = Use the path as the directory to store the file in and the filename from the uploaded filename
* @param {string} [options.field='file'] What the multi-part field name is (if omitted all fields will be accepted)
* @param {number} [options.limit=0] The maximum number of files to accept, set to 0 to accept all
* @param {function|array|string|boolean} [options.list] Middleware(s) to run before listing files at a given path
* @param {function|array|string|boolean} [options.get] Middleware(s) to run before reading a specific file
* @param {function|array|string|boolean} [options.post] Middleware(s) to run before accepting an file upload
* @param {function|array|string|boolean} [options.move] Middleware(s) to run before accept a file move command
* @param {function|array|string|boolean} [options.delete] Middleware(s) to run before deleteing a file
* @param {function|array} [options.postProcessing] Middleware(s) to run after a file has been accepted (req.files is decorated with additional properites `storagePath` for where the file is stored if a path was computed)
*
* @example
* // In an Express controller:
* app.use('/files/:path?', emu({
* 	path: '/data',
* });
* // Via a HTTP request
* POST /files => Upload a file
* GET /files /=> Retrieve a list of files
* GET /files/foo.txt /=> Read the foo.txt file
* DELTE /files/foo.txt /=> Delete the foo.txt file
*/

var _ = require('lodash');
var async = require('async-chainable');
var fs = require('fs');
var fspath = require('path');
var mkdirp = require('mkdirp');
var multer = require('multer');

// Utility functions {{{
/**
* Run optional middleware
* Middleware can be:
* 	- A function(req, res, next)
*	- An array of functions(req, res, next) - Functions will be called in sequence, all functions must call the next method
*	- A string - If specified (and `obj` is also specified) the middleware to use will be looked up as a key of the object. This is useful if you need to invoke similar methods on different entry points
*
* @param {Object} req The original request object
* @param {Object} res The original response object
* @param {null|function|array} middleware The optional middleware to run
* @param {function} callback The callback to invoke when completed. This may not be called
* @param {object} obj The parent object to look up inherited functions from (if middleware is a string)
*/
var runMiddleware = function(req, res, middleware, callback, obj) {
	var thisContext = this;
	var runnable; // The middleware ARRAY to run

	if (_.isBoolean(middleware) && !middleware) { // Boolean=false - deny!
		res.status(403).end();
	} else if (_.isUndefined(middleware) || _.isNull(middleware)) { // Nothing to do anyway
		return callback();
	} else if (_.isFunction(middleware)) {
		runnable = [middleware];
	} else if (_.isArray(middleware)) {
		runnable = middleware;
	} else if (_.isString(middleware) && _.has(obj, middleware)) {
		return runMiddleware(req, res, _.get(obj, middleware), callback, obj); // Defer to the pointer
	}

	async()
		.limit(1)
		.forEach(runnable, function(nextMiddleware, middlewareFunc, index) {
			middlewareFunc.apply(thisContext, [req, res, nextMiddleware]);
		})
		.end(function(err) {
			if (err) {
				res.sendError(403, err);
			} else {
				callback();
			}
		});
};
// }}}

var emu = function(options) {
	if (!_.isObject(options)) throw new Error('An options object must be passed to emu');
	var settings = _.defaults(options, emu.defaults);

	if (!settings.path) throw new Error('Cannot use emu without specifying a storage path');
	if (_.isString(settings.path)) settings.path = fspath.normalize(fspath.join(emu.defaults.basePath, settings.path)); // Neaten up the settings path so its absolute

	return function(req, res, next) {
		async()
			// Compute the path if its a function and return a shallow clone of settings with the mutated path
			.then('settings', function(next) {
				if (_.isString(settings.path)) { // Don't need to do anything for static paths
					return next(null, settings);
				} else if (_.isFunction(settings.path)) { // Run async function and wait for response
					settings.path(req, res, function(err, computedPath) {
						next(null, _.chain(settings) // Clone settings (so we don't damage the original) and mutate path to the returned value
							.clone()
							.set('path', computedPath)
							.value()
						);
					});
				} else {
					throw new Error ('express-middleware-upload setting `path` must be a string or a function');
				}
			})
			// }}}
			// Call the correct handler based on the incomming method / parameters {{{
			.then(function(next) {
				if (req.method == 'GET' && req.params.path) {
					runMiddleware(req, res, this.settings.get, ()=> emu.get(this.settings, req, res));
				} else if (req.method == 'GET') {
					runMiddleware(req, res, this.settings.list, ()=> emu.list(this.settings, req, res));
				} else if (req.method == 'POST') {
					runMiddleware(req, res, this.settings.post, ()=> emu.post(this.settings, req, res));
				} else if (req.method == 'MOVE') {
					runMiddleware(req, res, this.settings.post, ()=> emu.move(this.settings, req, res));
				} else if (req.method == 'DELETE') {
					if (!req.params.path) this.settings.errorHandler(req, res, 400, 'No file path specified');
					runMiddleware(req, res, this.settings.delete, ()=> emu.delete(this.settings, req, res));
				}
				next(); // Drop immediately though to the end so we can release the async object from memory
			})
			.end();
			// }}}
	};
};


/**
* Default settings for EMU
* The contents of this object get merged with every EMU factory call
* @var {Object}
*/
emu.defaults = {
	basePath: '',
	limit: 0,
	field: 'file',
	postPath: 'upload',
	errorHandler: function(req, res, code, message) {
		res.status(code).send(message).end();
	},
};


/**
* List all files at a given path
* This is the child middleware call of emu
* @see emu
* @param {Object} options An options object using the same standard as the parent middleware
* @param {string} options.path The storage path to use
*/
emu.list = function(settings, req, res) {
	async()
		// Check directory exists {{{
		.then(function(next) {
			fs.stat(settings.path, function(err, stat) {
				if (err && err.code == 'ENOENT') return next('DIRNOTEXIST');
				if (err) return next('Directory access error - ' + err.toString());
				if (!stat.isDirectory()) return next('Not a directory');
				next();
			});
		})
		// }}}
		// Fetch file listing {{{
		.then('files', function(next) {
			fs.readdir(settings.path, next);
		})
		// }}}
		// Decorate listings {{{
		.map('files', 'files', function(nextFile, path) {
			fs.stat(fspath.join(settings.path, path), function(err, stat) {
				nextFile(null, {
					name: fspath.basename(path),
					ext: fspath.extname(path).toLowerCase().replace(/^\./, ''),
					size: stat.size,
					created: stat.ctime, // Technically this should be stat.birthtime but in our case files are immutable so the change time is more valid
				});
			});
		})
		// }}}
		// End {{{
		.end(function(err) {
			if (err && err == 'DIRNOTEXIST') {
				res.send([]);
			} else if (err) {
				return settings.errorHandler(req, res, 400, err);
			} else {
				res.send(this.files);
			}
		});
		// }}}
};


/**
* Read a file at the specified path
* This is the child middleware call of emu
* @see emu
* @param {Object} options An options object using the same standard as the parent middleware
* @param {string} options.path The storage path to use
*/
emu.get = function(settings, req, res) {
	async()
		// Calculate path {{{
		.then('path', function(next) {
			next(null, fspath.normalize(`${settings.path}/${req.params.path}`));
		})
		// }}}
		// Check file exists {{{
		.then(function(next) {
			fs.access(this.path, function(err) {
				if (err && err.code == 'ENOENT') return next('File does not exist');
				if (err) return next('File access error - ' + err.toString());
				next();
			});
		})
		// }}}
		// Check file is within upload directory - prevent directory attacks {{{
		.then(function(next) {
			if (this.path.substr(0, settings.path.length) != settings.path) return next('File outside of storage directory!');
			next();
		})
		// }}}
		// End {{{
		.end(function(err) {
			if (err && err == 'File does not exist') return settings.errorHandler(req, res, 404, 'File not found');
			if (err) return settings.errorHandler(req, res, 400, err);
			res.sendFile(this.path);
		})
		// }}}
};


/**
* Upload a file
* This is the child middleware call of emu
* @see emu
* @param {Object} options An options object using the same standard as the parent middleware
* @param {string} options.path The storage path to use
*/
emu.post = function(settings, req, res) {
	async()
		// Sanity checks {{{
		.then(function(next) {
			if (settings.postPath == 'param') {
				settings.limit = 1;
				if (!req.param.path) return next('No filename given in req.params.path');
			}
			next();
		})
		// }}}
		// Boot multer {{{
		.then(function(next) {
			var multerHandle;

			if (settings.limit && settings.limit == 1 && settings.field) {
				multerHandle = multer().single(settings.field);
			} else if (settings.limit && settings.field) {
				multerHandle = multer().array(settings.field, {maxCount: settings.limit});
			} else if (settings.field) {
				multerHandle = multer().array(settings.field);
			} else {
				multerHandle = multer().any();
			}

			multerHandle(req, res, function(err) {
				if (err) return next(err);
				if (!req.files && !req.file) return next('No files uploaded');
				if (req.file) req.files = req.file;
				next();
			});
		})
		// }}}
		// Check base directory exists {{{
		.then(function(next) {
			mkdirp(settings.path, next)
		})
		// }}}
		// For each file... {{{
		.set('req', req)
		.forEach('req.files', function(nextFile, file) {
			async()
				// Determine the storage path {{{
				.then('filePath', function(next) {
					var filePath;
					switch (settings.postPath) {
						case 'upload':
							filePath = fspath.join(settings.path, file.originalname);
							break;
						case 'param':
							filePath = fspath.join(settings.path, req.params.path);
							break;
						case 'dir':
							filePath = fspath.join(settings.path, req.params.path, file.originalname);
							break;
					}
					filePath = fspath.normalize(filePath);
					next(null, filePath);
				})
				// }}}
				// Create its sub-dir if needed {{{
				.then(function(next) {
					if (settings.postPath != 'dir') return next(); // Using flat file storage if not 'dir'
					mkdirp(fspath.dirname(this.filePath), next);
				})
				// }}}
				// Write the file {{{
				.then(function(next) {
					file.storagePath = this.filePath;
					fs.writeFile(this.filePath, file.buffer, next);
				})
				// }}}
				// End {{{
				.end(nextFile)
				// }}}
		})
		// }}}
		// Call post processing behaviour {{{
		.then(function(next) {
			if (!settings.postProcessing || (_.isArray(settings.postProcessing) && !settings.postProcessing.length)) return next(); // Skip if no middleware
			runMiddleware(req, res, settings.postProcessing, next);
		})
		// }}}
		// End {{{
		.end(function(err) {
			if (err) return settings.errorHandler(req, res, 400, err);
			res.send({});
		})
		// }}}
};


/**
* Delete a file
* This is the child middleware call of emu
* @see emu
* @param {Object} options An options object using the same standard as the parent middleware
* @param {string} options.path The storage path to use
*/
emu.delete = function(settings, req, res) {
	async()
		// Calculate path {{{
		.then('path', function(next) {
			next(null, fspath.normalize(`${settings.path}/${req.params.path}`));
		})
		// }}}
		// Delete {{{
		.then(function(next) {
			fs.unlink(this.path, next);
		})
		// }}}
		// End {{{
		.end(function(err) {
			if (err) return settings.errorHandler(req, res, 400, err);
			res.sendStatus(200).end();
		})
		// }}}
};


/**
* Move / rename a file
* This is the child middleware call of emu
* @see emu
* @param {Object} options An options object using the same standard as the parent middleware
* @param {string} options.path The storage path to use
*/
emu.move = function(settings, req, res) {
	async()
		// Sanity checks {{{
		.then(function(next) {
			if (!req.headers.destination) return next('Destination header not specified');
			next();
		})
		// }}}
		// Calculate path {{{
		.then('path', function(next) {
			next(null, fspath.normalize(`${settings.path}/${req.params.path}`));
		})
		// }}}
		// Move {{{
		.then(function(next) {
			fs.rename(this.path, fspath.join(fspath.dirname(this.path), fspath.basename(req.headers.destination)), next);
		})
		// }}}
		// End {{{
		.end(function(err) {
			if (err) return settings.errorHandler(req, res, 400, err);
			res.sendStatus(200).end();
		})
		// }}}
};


module.exports = emu;
