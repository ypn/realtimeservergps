var mysql = require('mysql')
var app = require('http').createServer(handler)
var io = require('socket.io')(app);
var fs = require('fs');

app.listen(3000,function(){
  console.log('listten on port 3000');
});

function handler (req, res) {
  fs.readFile(__dirname + '/index.html',
  function (err, data) {
    if (err) {
      res.writeHead(500);
      return res.end('Error loading index.html');
    }
    res.writeHead(200);
    res.end(data);
  });
}

var db = mysql.createConnection({
    host: '127.0.0.1',
    user: 'root',
    password:'phamnhuy151192',
    database: 'erp',
    port:'3306'
});

db.connect(function(err){
    if (err) console.log(err)
});

io.on('connection', function (socket) {
  console.log('has new connection');
  socket.on('will_connect', function (data) {
    console.log('new device connected');
    io.emit('new_device_connected',{position:data});
  });

  socket.on('update_position',function(data){
    console.log('update_position');
    io.emit('update_position',{marker:data});
  });

  socket.on('disconnect',function(){
    console.log('a socket disconnect:'+socket.id);
  })
});
