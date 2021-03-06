//@author Sagar Karandikar
//@web    http://sagark.org/snapnotify/
//@about  Node.js server for SnapNotify

var http = require('http');
var gcm = require('node-gcm');
var fs = require('fs');

//load settings from file, store it to a settings object
eval(fs.readFileSync('snapserver.settings', encoding="ascii"));

//common vars
var registrationIds = [];
var url = settings.url; //find a way to get this for heroku?
var storedreg = "";

//liveness checker for heroku (prevent idle)
function liveness(){
    //here, we want to post to ourselves to prevent heroku idle
    var opts = {
        host: url,
        port: 80,
        path: '/liveness',
        method: 'POST'
    };
    var req = http.request(opts, function(res) {
        //do nothing
    });
    req.on('error', function(e) {
        console.log('problem with request: ' + e.message);
    });
    req.end();
}

if (settings.heroku){
    console.log('running in heroku mode');
    var port = process.env.PORT;
    console.log("started liveness checker for heroku");
    setInterval(liveness, 60*20*1000); //keep server alive on heroku
} else {
    console.log('running in "Own Server" mode');
    var port = 1337;
    console.log('not starting liveness checker');
}

//more common vars
var urlport = url + ":" + port;

//load from file and populate registrationIds
/* NOTE: if you want to use this with heroku, you'll need to git add
the registration_store file (populated with your device ids), since heroku 
operates with a read-only filesystem */
fs.readFile('registrations_store_file', 'ascii', function(err, data){
    if(err) {
        console.log("no registration file found");
        console.log("if you're running on heroku, see the note about loading from file in snapnotify-server.js");
    } else {
        storedreg = data;
        storedreg = storedreg.split(",");
        console.log("loaded registrations from file:");
        for (x = 0; x < storedreg.length; x++){
            registrationIds.push(storedreg[x]);
            console.log(storedreg[x]);
        }
    }
});

http.createServer(function (req, res) {
    switch(req.url) { 
        case '/':
            res.writeHead(200, {'Content-Type': 'text/plain'});
            res.end('Welcome to snapnotify-server! Your server is now running at: ' + urlport + '\n');
            break;
        case '/register':
            if (req.method == 'POST'){
                recstr = "";
                req.on('data', function(chunk) {
                    recstr += chunk.toString();
                });
                req.on('end', function() {
                    var newToken = JSON.parse(recstr).token
                    
                    console.log(newToken);
                    
                    if (registrationIds.indexOf(newToken) == -1) {
                        registrationIds.push(newToken);
                        console.log("registered");
                    } else {
                        console.log("registration exists");
                    }
                    console.log("writing registration ids to file");
                    var stream = fs.createWriteStream("registrations_store_file");
                    stream.once('open', function(fd) {
                        for (x = 0; x<(registrationIds.length-1); x++){
                            stream.write(registrationIds[x] + ",");
                        }
                        stream.write(registrationIds[registrationIds.length-1]);
                    });
                    console.log("writing complete");
                    res.writeHead(200, "OK", {'Content-Type': 'application/json'});
                    res.write(JSON.stringify({'status': true}));
                    res.end();
                });
            } else {
                console.log("REGISTRATION FAILURE");
                    res.writeHead(400, "KO", {'Content-Type': 'text/html'});
                    res.end();
            }
            break;
        case '/message':
            if (req.method == 'POST') {
                console.log('posted');
                recstr = "";
                req.on('data', function(chunk) {
                    recstr += chunk.toString();
                });

                req.on('end', function() {

                    var jsonObject = JSON.parse(recstr);

                    res.writeHead(200, "OK", {'Content-Type': 'text/html'});
                    res.end();
                    var sender = new gcm.Sender(settings.apikey);

                    var message = new gcm.Message({
                        collapseKey: 'demo',
                        priority: 'high',
                        contentAvailable: true,
                        delayWhileIdle: true,
                        timeToLive: 3,
                        data: {
                            action: jsonObject.action,
                            ref: jsonObject.ref,
                            before: jsonObject.before,
                            after: jsonObject.after,
                            commits: jsonObject.commits 
                        }
                    });

                    console.log(message);

                    sender.send(message, registrationIds, function (err, response) {
                        if(err) {
                          console.error(err);
                        } else {
                          console.log(response);
                        }
                    });
                });
            } else {
                console.log("Uh oh, you should have used a POST.");
            }
            break;
        case '/setup':
            res.writeHead(200, "OK", {'Content-Type': 'text/html'});
            res.end("Currently just filler, will eventually show a qrcode for easy config.");
            break;
        case '/liveness':
            if (req.method == 'POST') {
                console.log('server alive');
                req.on('end', function() {
                    res.writeHead(200, "OK", {'Content-Type': 'text/html'});
                    res.end();
                });
            }
            break;
    };
}).listen(port, '0.0.0.0');
console.log('Server running at: ' + urlport);
