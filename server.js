const express = require('express');
const bodyParser = require("body-parser");
const path = require('path');
const app = express();
const router = express.Router();
const { Client } = require('pg');
const cheerio = require('cheerio');
const fs = require('fs');
const crypto = require('crypto');

//Include all files in the public folder.
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use("/", router);

//global variables


//Initialize db connection.
const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
});
client.connect();

//Utility functions
function loadIt(filename) {
  var thePath = path.join(__dirname+filename);
  var theFile = fs.readFileSync(thePath);
  var $ = cheerio.load(theFile);
  return $;
};

function checkLogin(email, pw, res) {
  var insert = [];
  insert.push(email);
  client.query('SELECT pwhash, salt FROM users WHERE email=$1;',insert , (err, resp) => {
    if (err){
      var result = 'in the bad branch';
      res.send(result);
    } else {
      var result = crypto.createHash('md5').update(resp.rows[0].salt + pw).digest('hex');
      res.send(result == resp.rows[0].pwhash);
    }
  });
}

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname+'/index.html'));
});

app.get('/env', (req,res) => {
  resp = process.env.DATABASE_URL.toString();
  res.send(resp);
});

app.get('/test', (req, res) => {
  checkLogin('r.m.pettibone@gmail.com', 'password', res);
});

//This tests that cheerio can load a file already in the database, 
app.get('/cheeriotest', (req, res) => {
  var $ = loadIt('/index.html');
  $('div.footer').html('New footer!');
  responseString = $.html();
  res.send(responseString);
});

app.get('/dbtst', (req, res) => {
    client.query('SELECT * FROM activities;', (err, resp) => {
        if (err) {
          res.send('Could not connect to db');
        } else {
          res.send(resp.rows[0].act_name);
        }
      });
});

app.listen(process.env.PORT || 3000);


/*
app.get('/', function (request, response) {
  response.set('Content-Type', 'text/html');
  var errorString = '<html lang="en"><head><title>Error</title></head><body><h2>Something is wrong with the database!</h2></body></html>';
  var responseString = '<html lang="en"><head><title>Vehicles and Riders</title></head><body>';
  
  client.query('SELECT * FROM cars', (error1, result1) => {
		if (!error1) {
      responseString += '<h1>Cars</h1><table><tr><th>Username</th><th>Lat</th><th>Lng</th></tr>';
      for (let i = 0; i < result1.rows.length; i++) {
        responseString += '<tr><td>' + result1.rows[i].username + '</td><td>' + result1.rows[i].lat + '</td><td>' + result1.rows[i].lng + '</td></tr>';
      }
      responseString += '</table>';
      client.query('SELECT * FROM riders', (error2, result2) => {
        if (!error2) {
          responseString += '<h1>Riders</h1><table><tr><th>Username</th><th>Lat</th><th>Lng</th></tr>';
          for (let i = 0; i < result2.rows.length; i++) {
            responseString += '<tr><td>' + result2.rows[i].username + '</td><td>' + result2.rows[i].lat + '</td><td>' + result2.rows[i].lng + '</td></tr>';
          }
          responseString += '</table></body></html>';
          response.send(responseString);
        }
        else {
          response.send(errorString);
        }
      });

		}
		else {
			response.send(errorString);
		}
	});



router.post('/riders', function (request, response) {
  response.header("Access-Control-Allow-Origin", "*");
  response.header("Access-Control-Allow-Headers", "*");
  var errorBool = request.body.username == null || request.body.lat == null || request.body.lng == null;
  if(errorBool){
    var errorString = '{"error":"Whoops, something is wrong with your data!"}';
    response.send(errorString);
    return;
  }


	client.query('SELECT * FROM riders', (error, result) => {
		if (!error) {
      var responseString;
			for (let i = 0; i < result.rows.length; i++) {
        if(i == 0){ responseString = '[';}
        var jsonString = '{"username": "' + result.rows[i].username + '", "lat": ' + result.rows[i].lat + ', "lng": ' + result.rows[i].lng + '}';
        responseString += jsonString;
        if(i < result.rows.length-1){responseString += ',';}
        else {responseString += ']';}
			}
      response.send(responseString);
		}
		else {
      var errorString = '{"error":"Whoops, something is wrong with the database!"}';
			response.send(errorString);
		}
	});
});

*/