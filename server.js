const express = require('express');
const bodyParser = require("body-parser");
const cookieParser = require('cookie-parser');
const path = require('path');
const app = express();
const router = express.Router();
const { Client } = require('pg');
const cheerio = require('cheerio');
const fs = require('fs');
const crypto = require('crypto');
const { emitWarning } = require('process');
const client2 = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const MY_NUMBER = '+14302491085';

//Include all files in the public folder.
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(cookieParser());
app.use("/", router);
app.use(express.static(path.join(__dirname, '/public'))); 

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

function genSessionId() {
  var sessID = crypto.createHash('md5').update(Math.random().toString()).digest('hex').slice(0,10);
  return sessID;
}

app.get('/', (req, res) => {
  var sid = req.cookies['sessionID'];
  if(sid){
    client.query('SELECT * FROM sessions WHERE session_key=$1', [sid], (err1, res1) => {
      if(res1.rows.length == 0){
        res.sendFile(path.join(__dirname+'/index.html'));
      } else {
        var uid = res1.rows[0].user_id;
        client.query('SELECT * FROM users WHERE user_id=$1;', [uid], (err2, res2) => {
          var $ = loadIt('/dashboard.html');
          $('#userfn').html(res2.rows[0].fname);
          client.query('SELECT poll_name, poll_id FROM polls WHERE owner=$1;', [uid], (err3, res3) => {
            var insertString = '<option value="0">Select a Poll to View</option>';
            for(var i = 0; i < res3.rows.length; i++){
              insertString += '<option value="' + res3.rows[i].poll_id + '">' + res3.rows[i].poll_name + '</option>';
            }
            $('#poll-list').html(insertString);
            res.send($.html());
          });
        });
      }
    });
  } else {
    res.sendFile(path.join(__dirname+'/index.html'));
  }
});

app.post('/signup', (req, res) => {
  client.query('SELECT user_id FROM users WHERE email=$1;', [req.body.email], (err1, res1) => {
    if(res1.rows.length != 0){
      var errstring = 'User already exists.';
      var $ = loadIt('/public/signup.html');
      $('div.errorspace').html(errstring);
      responseString = $.html();
      res.send(responseString);
    }else if(req.body.pw != req.body.pw2){
      var errstring = 'Passwords do not match.';
      var $ = loadIt('/public/signup.html');
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
  client.query('SELECT * FROM users WHERE email=$1;', [req.body.email], (err1, res1) => {
    var something_wrong = (res1.rows.length == 0)||(crypto.createHash('md5').update(res1.rows[0].salt+req.body.pw).digest('hex') != res1.rows[0].pwhash);
    if(something_wrong){
      var errstring = 'There was a problem with your login credentials.';
      var $ = loadIt('/public/signin.html');
      $('div.errorspace').html(errstring);
      responseString = $.html();
      res.send(responseString);
    }else{
      var sid = genSessionId();
      var uid = res1.rows[0].user_id;
      client.query('INSERT INTO sessions VALUES ($1, $2);', [sid, uid], (err2, res2) => {});
      var $ = loadIt('/dashboard.html');
      res.cookie('sessionID', sid);
      //$('#cookiespace').html('document.cookie = "sessionID=' + sid + '";');
      $('#userfn').html(res1.rows[0].fname);
      client.query('SELECT poll_name, poll_id FROM polls WHERE owner=$1;', [uid], (err3, res3) => {
        var insertString = '<option value="0">Select a Poll to View</option>';
        for(var i = 0; i < res3.rows.length; i++){
          insertString += '<option value="' + res3.rows[i].poll_id + '">' + res3.rows[i].poll_name + '</option>';
        }
        $('#poll-list').html(insertString);
        res.send($.html());
      });
    }
  });
});

app.post('/logout', (req, res) => {
  var sid = req.cookies['sessionID'];
  client.query('DELETE FROM sessions WHERE session_key=$1;', [sid], (err1, res1) => {});
  var $ = loadIt('/index.html');
  $('#message').html('You have been logged out successfully!');
  res.send($.html());
})

app.get('/twiliotest', (req, res) => {
  client2.messages
  .create({
     body: 'It works!',
     from: MY_NUMBER,
     to: '+14257607569'
   });
});

app.get('/pollpage', (req, res) => {
  client.query('SELECT question FROM polls WHERE poll_id=1', (req1, res1) => {
    var q = res1.rows[0].question;
    var $ = loadIt('/pollpage.html');
    $('#question').html(q);
    res.send($.html());
  });
});

app.post('/pollresponse', (req, res) => {
  client.query('INSERT INTO responses VALUES ($1, $2, $3, $4, $5, $6, $7);', [1,  Math.floor(Math.random() * 10000), req.body.question, req.body.gender, req.body.age, req.body.ethnicity, req.body.party], (err1, res1) => {
    res.send('Thank you for your response!');
  });
});

app.post('/pollresultspage', (req, res) => {
  client.query('SELECT * FROM responses WHERE poll_id=$1', [req.body.polls], (err1, res1) => {
    var total = [0,0,0];
    var gendata = [[0,0,0],[0,0,0],[0,0,0]];
    var pardata = [[0,0,0],[0,0,0],[0,0,0]];
    var agedata = [[0,0,0],[0,0,0],[0,0,0],[0,0,0]];
    var ethdata = [[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0]];

    for(var i = 0; i < res1.rows.length; i++){
      var row = res1.rows[i];
      var ans = parseInt(row.resp);
      if(ans != -1 && ans != 6){
        total[2]++;
        total[ans]++;

        var gencode = parseInt(row.gender);
        if(gencode != -1 && gencode != 6){
          gendata[gencode][2]++;
          gendata[gencode][ans]++;
        }

        var agecode = parseInt(row.age);
        if(agecode != -1 && agecode != 6){
          agedata[agecode][2]++;
          agedata[agecode][ans]++;
        }

        var ethcode = parseInt(row.ethnicity);
        if(ethcode != -1 && ethcode != 6){
          ethdata[ethcode][2]++;
          ethdata[ethcode][ans]++;
        }

        var parcode = parseInt(row.party);
        if(parcode != -1 && parcode != 6){
          pardata[parcode][2]++;
          pardata[parcode][ans]++;
        }
      }
    }

    var totresults = [0,0];
    if(total[2] != 0){
      totresults[0] = total[0]/total[2]*100;
      totresults[1] = total[1]/total[2]*100;
    }
    var genresults = [[0,0,0],[0,0,0]];
    for(var i = 0; i < gendata.length; i++){
      if(gendata[i][2] != 0){
        genresults[0][i]= gendata[i][0]/gendata[i][2]*100;
        genresults[1][i] = gendata[i][1]/gendata[i][2]*100;
      }
    }
    genresults = JSON.stringify(genresults);
    var genlabels = JSON.stringify(['Male', 'Female', 'Non-Binary']);
   
    var parresults = [[0,0,0],[0,0,0]]
    for(var i = 0; i < pardata.length; i++){
      if(pardata[i][2] != 0){
        parresults[0][i] = pardata[i][0]/pardata[i][2]*100;
        parresults[1][i] = pardata[i][1]/pardata[i][2]*100;
      }
    }
    parresults = JSON.stringify(parresults);
    var parlabels = JSON.stringify(['Democrat', 'Republican', 'Other']);

    var ageresults = [[0,0,0,0],[0,0,0,0]];
    for(var i = 0; i < agedata.length; i++){
      if(agedata[i][2] != 0){
        ageresults[0][i] = agedata[i][0]/agedata[i][2]*100;
        ageresults[1][i] = agedata[i][1]/agedata[i][2]*100;
      }
    }
    ageresults = JSON.stringify(ageresults);
    var agelabels = JSON.stringify(['18-24','25-39','40-64','65+']);

    var ethresults = [[0,0,0,0,0,0],[0,0,0,0,0,0]];
    for(var i = 0; i < ethdata.length; i++){
      if(ethdata[i][2] != 0){
        ethresults[0][i] = ethdata[i][0]/ethdata[i][2]*100;
        ethresults[0][i] = ethdata[i][1]/ethdata[i][2]*100;
      }
    }
    ethresults = JSON.stringify(ethresults);
    var ethlabels = JSON.stringify(['Asian/Pacific Islander', 'Black or African American', 'Hispanic or Latino', 'Native American or American Indian', 'White', 'Other']);
    
    var $ = loadIt('/pollresultspage.html');
    $('#insert').html('grapher("gender",'+ genlabels +  ',' + genresults + ');' +
                      'grapher("age",'+ agelabels +  ',' + ageresults + ');' +
                      'grapher("party",'+ parlabels +  ',' + parresults + ');' +
                      'grapher("ethnicity",'+ ethlabels +  ',' + ethresults + ');' 
                );
    res.send($.html());

  });
});


app.listen(process.env.PORT || 3000);