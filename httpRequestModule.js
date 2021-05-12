const formurlencoded = require('form-urlencoded');
const zlib = require('zlib');
const https = require('https');

const keepAliveAgent = new https.Agent({ keepAlive: true });

const cookiesToIgnore = ['SessionTimeout', 'SessionStart'];

const defaultOptions = {
	rejectUnauthorized: false,
	requestCert: false,
	agent: keepAliveAgent,
	encoding: null,
};

const headers = {
	'Accept-Encoding': 'gzip, deflate',
	'User-Agent': 'Wget/1.11.4',
	Accept: '*/*',
};

function getRequest(host, path, cookies = {}, referer, port = 443) {
	let cookiesArray = [];
	for (let cookie in cookies) {
		cookiesArray.push(`${cookie}=${cookies[cookie]}`);
	}
	let httpsOptions = {
		...defaultOptions,
		host: host,
		path: path,
		port: port,
		method: 'GET',
		headers: {
			...headers,
			Cookie: cookiesArray,
		},
	};
	if (referer) {
		httpsOptions.headers['Referer'] = referer;
	}
	return processRequest(httpsOptions);
}

function postFormRequest(host, path, body, cookies = {}, referer, port = 443) {
	let cookiesArray = [];
	for (let cookie in cookies) {
		cookiesArray.push(`${cookie}=${cookies[cookie]}`);
	}
	let bodyToSend = formurlencoded(body);
	let length = bodyToSend.length;
	let httpsOptions = {
		...defaultOptions,
		host: host,
		path: path,
		port: port,
		method: 'POST',
		headers: {
			...headers,
			'Content-Type': 'application/x-www-form-urlencoded',
			Cookie: cookiesArray,
			'Content-Length': length,
		},
	};
	if (referer) {
		httpsOptions.headers['Referer'] = referer;
	}
	return processRequest(httpsOptions, bodyToSend);
}

function processRequest(options, body = undefined) {
	return new Promise(async (resolve) => {
		let retry = true;
		while (retry) {
			try {
				let { data, headers, statusCode } = await new Promise((resolve, reject) => {
					// let data = '';
					let data = [];
					let headers = {};
					let statusCode = '';
					let requestCallback = (response) => {
						response.on('data', (dataReceived) => {
							// data += dataReceived;
							data.push(dataReceived);
						});
						response.on('end', () => {
							let buffer = Buffer.concat(data);
							if (headers['content-encoding'] == 'gzip') {
								zlib.gunzip(buffer, (err, dezipped) => {
									if (dezipped) {
										resolve({ data: dezipped.toString(), headers, statusCode });
									} else {
										resolve({ data: buffer, headers, statusCode });
									}
								});
							} else {
								resolve({ buffer, headers, statusCode });
							}
							// resolve({ data, headers });
						});
						response.on('error', (err) => {
							reject(err);
						});
					};

					let request = https.request(options, requestCallback);
					request.on('response', (res) => {
						headers = res.headers;
						statusCode = res.statusCode;
					});
					request.on('error', (e) => {
						reject(e);
					});

					if (body !== undefined) {
						// request.write(JSON.stringify(body));
						request.write(body);
					}

					request.end();
				});
				retry = false;
				let cookies = parseCookies(headers);
				resolve({ data, cookies, headers, statusCode });
			} catch (error) {
				retry = true;
			}
		}
	});
}

function parseCookies(headers) {
	let cookies = [];
	let cookiesPresent = Object.keys(headers).find((header) => header.match(/set-cookie/i));
	if (cookiesPresent) {
		let headerCookies = headers[cookiesPresent];
		for (let cookie of headerCookies) {
			let cookieSplited = cookie.split(';')[0].split('=');
			if (!cookiesToIgnore.includes(cookieSplited[0])) {
				cookies[cookieSplited[0]] = cookieSplited[1];
			}
		}
	}
	return cookies;
}

module.exports = {
	getRequest,
	postFormRequest,
};
