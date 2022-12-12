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
const validator = require('validator');
const MY_NUMBER = '+14302491085';
const fileUpload = require('express-fileupload');
const { parse } = require('csv-parse');
const csv=require('csvtojson');

//Include all files in the public folder.
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(cookieParser());
app.use(fileUpload());
app.use("/", router);
app.use(express.static(path.join(__dirname, '/public'))); 


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
};

function getRandomInt(max) {
  return Math.floor(Math.random() * max);
}

//GET and POST handling
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
          $('#userfn').html(res2.rows[0].fname + '!');
          client.query('SELECT poll_name, poll_id FROM polls WHERE owner=$1;', [uid], (err3, res3) => {
            var insertString = '<option value="0">Select a Poll</option>';
            for(var i = 0; i < res3.rows.length; i++){
              insertString += '<option value="' + res3.rows[i].poll_id + '">' + res3.rows[i].poll_name + '</option>';
            }
            $('.poll-list').html(insertString);
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
    }else if(!validator.isEmail(req.body.email)){
      var errstring = 'Not a valid email.';
      var $ = loadIt('/public/signup.html');
      $('div.errorspace').html(errstring);
      responseString = $.html();
      res.send(responseString);
    }else{
      var salt = crypto.createHash('md5').update(Math.random().toString()).digest('hex').slice(0,10);
      var pwhash = crypto.createHash('md5').update(salt+req.body.pw).digest('hex');
      client.query('INSERT INTO users(email, salt, pwhash, fname, lname, office) VALUES ($1, $2, $3, $4, $5, $6);', [req.body.email, salt, pwhash, req.body.fname, req.body.lname, req.body.office], (err2, res2) => {
        var $ = loadIt('/index.html');
        $('#message').html('Account created successfully! Please sign in to continue.');
        res.send($.html());
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
      var sid = crypto.createHash('md5').update(Math.random().toString()).digest('hex').slice(0,10);
      var uid = res1.rows[0].user_id;
      client.query('DELETE FROM sessions WHERE user_id=$1;', [uid], (err2, res2) => {});
      client.query('INSERT INTO sessions VALUES ($1, $2);', [sid, uid], (err2, res2) => {});
      var $ = loadIt('/dashboard.html');
      res.cookie('sessionID', sid);
      $('#userfn').html(res1.rows[0].fname);
      client.query('SELECT poll_name, poll_id FROM polls WHERE owner=$1;', [uid], (err3, res3) => {
        var insertString = '<option value="0">Select a Poll to View</option>';
        for(var i = 0; i < res3.rows.length; i++){
          insertString += '<option value="' + res3.rows[i].poll_id + '">' + res3.rows[i].poll_name + '</option>';
        }
        $('.poll-list').html(insertString);
        res.send($.html());
      });
    }
  });
});

app.post('/logout', (req, res) => {
  var sid = req.cookies['sessionID'];
  res.cookie('sessionID','');
  client.query('DELETE FROM sessions WHERE session_key=$1;', [sid], (err1, res1) => {});
  var $ = loadIt('/index.html');
  $('#message').html('You have been logged out successfully!');
  res.send($.html());
})

app.get('/pollpage', (req, res) => {
  var pid = req.query.pid;
  var rid = req.query.rid;
  client.query('SELECT question FROM polls WHERE poll_id=$1', [pid], (req1, res1) => {
    var q = res1.rows[0].question;
    var $ = loadIt('/pollpage.html');
    $('#question').html(q);
    var hidden = '<input type="hidden" name="pid" value="' + pid + '">'
    var hidden2 = '<input type="hidden" name="rid" value="' + rid + '">'
    $('#pid').html(hidden);
    $('#rid').html(hidden2);
    res.send($.html());
  });
});

app.get('/createpoll', (req, res) => {
  res.sendFile(path.join(__dirname+'/createpoll.html'));
});

app.post('/createpoll', (req, res) => {
  var sid = req.cookies['sessionID'];
  client.query('SELECT user_id FROM sessions WHERE session_key=$1', [sid], (err1, res1) =>{
    var uid = res1.rows[0].user_id;
    client.query('INSERT INTO polls(owner, poll_name, question) VALUES ($1, $2, $3)', [uid, req.body.poll_name, req.body.question], (err2, res2) => {
      res.redirect('/');
    });
  });
});

app.post('/pollresponse', (req, res) => {
  client.query('UPDATE responses SET resp=$1, gender=$2, age=$3, ethnicity=$4, party=$5 WHERE poll_id=$6 AND resp_id=$7;', [req.body.question, req.body.gender, req.body.age, req.body.ethnicity, req.body.party, req.body.pid, req.body.rid], (err1, res1) => {
    res.sendFile(path.join(__dirname+'/thankyou.html'));
  });
});

app.post('/pollresultspage', (req, res) => {
  client.query('SELECT * FROM responses WHERE poll_id=$1', [req.body.polls], (err1, res1) => {
    if(req.body.polls == 0){
      res.redirect('/');
     } else {
      var total = [0,0,0,0];
      var gendata = [[0,0,0],[0,0,0],[0,0,0]];
      var pardata = [[0,0,0],[0,0,0],[0,0,0]];
      var agedata = [[0,0,0],[0,0,0],[0,0,0],[0,0,0]];
      var ethdata = [[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0]];

      for(var i = 0; i < res1.rows.length; i++){
        var row = res1.rows[i];
        var ans = parseInt(row.resp);

        if(ans != -1){
          total[3]++;
          if(ans == 6){
            total[2]++;
          } else {
            total[ans]++;
          }
        }

        if(ans != -1 && ans != 6){

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

      var totresults = [[0, 0, 0]];
      var totlabels = JSON.stringify(['Yes', 'No', 'Chose not to Respond']);
      if(total[3] != 0){
        totresults[0][0] = total[0]/total[3]*100;
        totresults[0][1] = total[1]/total[3]*100;
        totresults[0][2] = total[2]/total[3]*100;
      }
      totresults = JSON.stringify(totresults);

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
          ethresults[1][i] = ethdata[i][1]/ethdata[i][2]*100;
        }
      }
      ethresults = JSON.stringify(ethresults);
      var ethlabels = JSON.stringify(['Asian/Pacific Islander', 'Black or African American', 'Hispanic or Latino', 'Native American or American Indian', 'White', 'Other']);
      
      var noResponses = total[3];
      var $ = loadIt('/pollresultspage.html');
      $('#insert').html('grapher("totals",'+ totlabels +  ',' + totresults + ');' +
                        'grapher("gender",'+ genlabels +  ',' + genresults + ');' +
                        'grapher("age",'+ agelabels +  ',' + ageresults + ');' +
                        'grapher("ethnicity",'+ ethlabels +  ',' + ethresults + ');' +
                        'grapher("party",'+ parlabels +  ',' + parresults + ');'
                  );
      $('#tot').html(noResponses);
      res.send($.html());
    }
  });
});

app.post('/pollsendpage', (req, res) => {
  var sid = req.cookies['sessionID'];
  var poll_id = req.body.polltosend;
  client.query('SELECT user_id FROM sessions WHERE session_key=$1', [sid], (err1, res1) => {
    var uid = res1.rows[0].user_id;
    client.query('SELECT * FROM polls WHERE poll_id=$1', [poll_id], (err2, res2)=> {
      client.query('SELECT * FROM users WHERE user_id=$1', [uid], (err3, res3) => {
        if(req.body.polltosend == 0){
          res.redirect('/');
         } else {
          var fname = res3.rows[0].fname;
          var lname = res3.rows[0].lname;
          var office = res3.rows[0].office;
          var question = res2.rows[0].question;
          var message = 'Hello, I am ' + fname + ' ' + lname + ', and I am your ' + office + 
            '. Please help me represent you more effectively by clicking the link below and answering the following poll question: "' +
            question + '" Thank you for your help! ';
          var $ = loadIt('/sendpoll.html');
          $('#messagespace').html('<p>' + message + '<br>--Link to Your Poll--</p>');
          $('input[name="message"]').val(message);
          var hidden2 = '<input type="hidden" name="pollid" value="' + poll_id + '">';
          $('#pollidspace').html(hidden2);
          res.send($.html());
         }
      });
    });
  });
});

app.post('/sendpoll2', (req, res) => {
  res.sendFile(path.join(__dirname, '/sendpoll2.html'));
  var pid = req.body.pollid;
  var message = req.body.message;
  //var scale = req.body.scale;
  var scale = 2;
  
  var ac = req.body.ac;

  client.query('SELECT MAX(resp_id) FROM responses WHERE poll_id=$1;', [pid], (req1, res1) => {
    let min;
    if(res1.rows[0].max){
      min = parseInt(res1.rows[0].max) + 1;
    }else{
      min = 0;
    }
    
    for(var i = 0; i < 50; i++){
      var resp = getRandomInt(3);
      var gen = getRandomInt(3);
      var age = getRandomInt(4);
      var eth = getRandomInt(6);
      var par = getRandomInt(3);
      client.query('INSERT INTO responses VALUES ($1, $2, $3, $4, $5, $6, $7);', [pid, i, resp, gen, age, eth, par], (req2, res2) => {});
    }

    var fullmessage = message + "http://polipoller.herokuapp.com/pollpage?pid=" + pid + "&rid=";
    for(var i = min; i < min + scale; i++){
      
      /*
      client.query('INSERT INTO responses VALUES ($1, $2, $3, $4, $5, $6, $7);', [pid, i, -1, -1, -1, -1, -1], (req2, res2) => {});
      var fullermessage = fullmessage + String(i);
      client2.messages.create({
        body: fullermessage,
        from: MY_NUMBER,
        to: '+14257607569'
      }); */
    }
  });
});

app.get('/upload', (req, res) => {
  res.sendFile(path.join(__dirname+'/upload.html'));
});

app.post('/upload', (req, res) => {
 /* if (!req.files) {
    return res.status(400).send("No files were uploaded.");
  }*/

  var y = req.files.csv.data.toString().split('\n');
  var pattern = '^[0-9]{10}$';
  var toLoad = []
  res.send('Success!');

  var sid = req.cookies['sessionID'];
  if(sid){
    client.query('SELECT * FROM sessions WHERE session_key=$1', [sid], (err1, res1) => {
      if(res1.rows.length == 0){
        res.sendFile(path.join(__dirname+'/index.html'));
      } else {
        var uid = res1.rows[0].user_id;
        for(var i = 0; i < y.length; i++){
          if(y[i].match(pattern)){
            toLoad.push('+1'+y[i].toString());
          }
        }
        toLoad.map((element) => {
          client.query('SELECT * FROM numbers WHERE user_id=$1 AND phone=$2;', [uid, element], (err3, res3) => {
            if(res3.rows.length == 0){
              client.query('INSERT INTO numbers VALUES ($1,$2);', [uid, element], (err4, res4)=>{});
            }
          });
        });
      }
    });
  } else {
    res.sendFile(path.join(__dirname+'/index.html'));
  }
});

app.listen(process.env.PORT || 3000);