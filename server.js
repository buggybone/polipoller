const express = require('express');
const bodyParser = require("body-parser");
const path = require('path');
const app = express();
const router = express.Router();
const { Client } = require('pg');
const cheerio = require('cheerio');
const fs = require('fs');
const crypto = require('crypto');
const client2 = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const MY_NUMBER = '+14302491085';

//Include all files in the public folder.
app.use(express.static(path.join(__dirname, ''))); //CHANGE THIS LATER FOR SECURITY PURPOSES
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

/*
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
}*/

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname+'/index.html'));
});

app.post('/signup', (req, res) => {
  client.query('SELECT user_id FROM users WHERE email=$1;', [req.body.email], (err1, res1) => {
    if(res1.rows.length != 0){
      var errstring = 'User already exists.';
      var $ = loadIt('/signup.html');
      $('div.errorspace').html(errstring);
      responseString = $.html();
      res.send(responseString);
    }else if(req.body.pw != req.body.pw2){
      var errstring = 'Passwords do not match.';
      var $ = loadIt('/signup.html');
      $('div.errorspace').html(errstring);
      responseString = $.html();
      res.send(responseString);
    }else{
      var salt = crypto.createHash('md5').update(Math.random().toString()).digest('hex').slice(0,10);
      var pwhash = crypto.createHash('md5').update(salt+req.body.pw).digest('hex');
      client.query('INSERT INTO users(email, salt, pwhash, fname, lname, office) VALUES ($1, $2, $3, $4, $5, $6);', [req.body.email, salt, pwhash, req.body.fname, req.body.lname, req.body.office], (err2, res2) => {
        //add more
        res.sendFile(path.join(__dirname+'/dashboard.html'));
      });
    }
  });
});

app.post('/signin', (req, res) => {
  client.query('SELECT email, salt, pwhash FROM users WHERE email=$1;', [req.body.email], (err1, res1) => {
    var something_wrong = (res1.rows.length == 0)||(crypto.createHash('md5').update(res1.rows[0].salt+req.body.pw).digest('hex') != res1.rows[0].pwhash);
    if(something_wrong){
      var errstring = 'There was a problem with your login credentials.';
      var $ = loadIt('/signin.html');
      $('div.errorspace').html(errstring);
      responseString = $.html();
      res.send(responseString);
    }else{
      res.sendFile(path.join(__dirname+'/dashboard.html'));
    }
  });
});

app.get('/twiliotest', (req, res) => {
  client2.messages
  .create({
     body: 'It works!',
     from: MY_NUMBER,
     to: '+14257607569'
   });
});

app.listen(process.env.PORT || 3000);


/*
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