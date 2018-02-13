var mysql = require('mysql')
var moment = require('moment')
var app = require('http').createServer(handler)
var io = require('socket.io')(app);
var fs = require('fs');
app.listen(3000,function(){
  console.log('listten on port 3000');
});

function getRandomColor() {
  var letters = '0123456789ABCDEF';
  var color = '#';
  for (var i = 0; i < 6; i++) {
    color += letters[Math.floor(Math.random() * 16)];
  }
  return color;
}


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
    dateStrings:true,
    port:'3306'
});

db.connect(function(err){
    if (err) console.log(err)
});

io.on('connection', function (socket) {
  //new car tracking session
  socket.on('new_car_tracking_detected', function (data) {
    //get all checkponts
    db.query("SELECT id,maxtime FROM CHECKPOINTS",function(err,result){
      if(err){
        //Log lỗi
        console.log(err)
      }else{
        var checkpoints ={}

        for(i = 0; i< result.length ; i++){
          var cp = {
            checkpointId: result[i].id,
            max_time:result[i].maxtime,
            status:0,
            time_start:0,
            time_end:'',
            total_time:''
          }
          checkpoints.push(cp);
        }
        let status = JSON.stringify(checkpoints);

        let color = getRandomColor();

        var sql = `INSERT INTO POSITIONS_TRACKING (bienso,type,car_positions,status,current_position,path_color) VALUES('${data.bienso}',1,'["{lat:${data.lat},lng:${data.lng}}"]','${status}','{lat:${data.lat},lng:${data.lng}}','${color}')`;
        db.query(sql, function (err, result) {
            if (err) {//log lỗi
              console.log(err);
            }else{
                socket.emit('create_tracking_session',{
                  status:201,
                  id:`${result.insertId}`
                });

                var ss = `SELECT id,bienso,status,created_at,path_color FROM POSITIONS_TRACKING WHERE id = ${result.insertId}`;

                db.query(ss,function(errr,resultt){
                  if(errr){
                    console.log(errr);
                  }else{
                    io.emit('new_session_detected',{data:JSON.stringify(resultt[0]),position:{lat:data.lat,lng:data.lng}});
                  }
                });

            }
        });
      }
    });//get all checkpoints
  });//new car tracking session

  socket.on('update_position',function(data){
    var query = `UPDATE POSITIONS_TRACKING SET car_positions = JSON_ARRAY_APPEND(car_positions,'$','{lat:${data.lat},lng:${data.lng}}'), current_position = '{lat:${data.lat},lng:${data.lng}}' WHERE ID = ${data.sessionId}` ;
    var latlng = {
      lat:data.lat,
      lng:data.lng
    };

    db.query(query,function(err,result){
      if(err){
        console.log(err);
      }
    });

    io.emit('update_position',{marker:latlng,id:data.sessionId});
  });

  socket.on('session_step_into_checkpoint',function(data){
    //Cập nhật lại trạng thái của sesssion.
    var time_start = new Date();
    var query = `UPDATE POSITIONS_TRACKING SET status = JSON_REPLACE(status,'$[0].cp_${data.checkpointId}.status',1,'$[0].cp_${data.checkpointId}.time_start','${time_start}') WHERE id = ${data.sessionId}`;

    db.query(query,function(err,result){
      if(err){
        console.log(err);
      }else{
        io.emit('session_step_into_checkpoint',{data:data});
      }
    });

  });

  socket.on('session_step_out_checkpoint',function(data){

    var time_end = new Date();
    var query = `UPDATE POSITIONS_TRACKING SET status = JSON_REPLACE(status,'$[0].cp_${data.checkpointId}.status',2,'$[0].cp_${data.checkpointId}.time_end','${time_end}','$[0].cp_${data.checkpointId}.total_time','${data.total_time}') WHERE id = ${data.sessionId}`;

    db.query(query,function(err,result){
      if(err){
        console.log(err);
      }else{
        io.emit('session_step_out_checkpoint',{data:data});
      }
    });

  });

  socket.on('stop_traking',function(data){
    console.log('=========STOP TRACKING==============')
    console.log('session:' + data.sessionId);
    console.log('====================================');
    let mysqlTimestamp = moment(Date.now()).format('YYYY-MM-DD HH:mm:ss');
    let sql_update = `UPDATE POSITIONS_TRACKING SET type= 0,ended_at = '${mysqlTimestamp}' WHERE id = ${data.sessionId}`;
    db.query(sql_update,function(err,result){
      if(err){
        console.log(err);
      }else{
        io.emit('stop_tracking',{sessionId:data.sessionId});
      }
    });

  });

});
