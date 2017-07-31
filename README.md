Express-Middleware-Upload
=========================
Express middleware to assist with file upload CRUD (uploads, listing, reading and deletion).


```javascript
var emu = require('express-middleware-upload');
var express = require('express');
var app = express();

app.use('/api/files/:path?', emu({
	path: '/my/storage/path',
}));
```

By default "EMU" will expose an unloader at the specified end-point as well as the ability to list, read and delete files.
In the above example the following URL methods will upload, list, read and delete files:

| Method   | URL                  | Payload           | Description                                 |
|----------|----------------------|-------------------|---------------------------------------------|
| `POST`   | `/api/files`         | Multipart file(s) | Upload a file / files to the API end-point  |
| `GET`    | `/api/files`         |                   | List all uploads at the end-point           |
| `GET`    | `/api/file/FILENAME` |                   | Read a specific filename at the end-point   |
| `DELETE` | `/api/file/FILENAME` |                   | Delete a specific filename at the end-point |



API
===

The base usage of 'EMU' is to attach it to an Express end-point and give it a configuration object.

```javascript
app.use('/api/files/:path?', emu(configOptions));
```

The following table lists the valid configuration options. The only mandatory setting is `path` all others are optional.

| Option         | Type                      | Default    | Description |
|----------------|---------------------------|--------------------------|
| `path`         | String                    |            | Mandatory path of where to store uploaded files |
| `basePath`     | String                    |            | Prefix automatically prepended onto options.path (this is separate so it can be set globally to your application root via `emu.defaults.basePath`) |
| `errorHandler` | Function                  |            | How to output errors. This should be a function called as (req, res, statusCode, message)
| `postPath`     | String                    | `'upload'` | How to name the uploaded file. `'upload'` = Use the uploaded filename appended to options.path, `'param'` = Use the path specified in `req.params.path` (implies `options.limit=1`), `'dir'` = Use the path as the directory to store the file in and the filename from the uploaded filename |
| `field`        | String                    | `'file'`   | What the multi-part field name is (if falsy, all fields will be accepted - this is not recommended) |
| `limit`        | Number                    | `0`        | The maximum number of files to accept, set to 0 for no limit |
| `list`         | Function, Array, String, Boolean |         | Middleware(s) to run before listing files at a given path. See below for comments. |
| `get`          | Function, Array, String, Boolean |         | Middleware(s) to run before reading a specific file. See below for comments. |
| `post`         | Function, Array, String, Boolean |         | Middleware(s) to run before accepting an file upload. See below for comments. |
| `delete`       | Function, Array, String, Boolean | `false` | Middleware(s) to run before deleting a file. See below for comments. |


Middleware
----------
The `list`, `get`, `post` and `delete` options can all accept either a function, an array of functions, a string or a boolean.

* If the value is a **function** it is executed as a regular Express middleware (called as `func(req, res, next)`).
* If the value is an **array** the functions are executed in order specified (each called as `func(req, res, next)`).
* If the value is a **string** its functionality is determined by another option. E.g. setting `list: 'post'` property instructs EMU to use the same middleware specified in `post`.
* If the value is a **boolean** it is used to universally enable or reject the method. Setting the value to true will allow the method (the default anyway) and setting it to false will disable it entirely.

```javascript
app.use('/api/files/:path?', emu({
	post: function(req, res, next) { // Only allow the 'post' method if the user is valid (this assumes something like Passport to provide the `req.user` object)
		if (!req.user) return res.sendStatus(403);
		next();
	},
	list: 'post', // Copy the same middleware from 'post'
	get: 'post', 
	delete: false, // Forbid all deletes
});
```
