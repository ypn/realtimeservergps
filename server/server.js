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
  //new car tracking session
  socket.on('new_car_tracking_detected', function (data) {
    //get all checkponts
    db.query("SELECT id,maxtime FROM CHECKPOINTS",function(err,result){
      if(err){
        //Log lỗi
        console.log(err)
      }else{
        var checkpoints =[]
        console.log('cai lozz');
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

        var status = JSON.stringify(checkpoints);

        var sql = `INSERT INTO POSITIONS_TRACKING (bienso,type,car_positions,status) VALUES('${data.bienso}',1,'[]','${status}')`;
        db.query(sql, function (err, result) {
            if (err) {//log lỗi
              console.log(err);
            }else{
                socket.emit('create_tracking_session',{
                  status:201,
                  id:`${result.insertId}`
                });

                var ss = `SELECT id,bienso,status FROM POSITIONS_TRACKING WHERE id = ${result.insertId}`;

                db.query(ss,function(err,result){
                  if(err){
                    console.log(err);
                  }else{
                    io.emit('new_session_detected',{data:JSON.stringify(result[0])});
                  }
                });

            }
        });
      }
    });//get all checkpoints
  });//new car tracking session

  socket.on('update_position',function(data){

    var query = `UPDATE POSITIONS_TRACKING SET car_positions = JSON_ARRAY_APPEND(car_positions,'$','{lat:${data.lat},lng:${data.lng}}') WHERE ID = ${data.sessionId}` ;
    var latlng = {
      lat:data.lat,
      lng:data.lng
    };

    db.query(query,function(err,result){
      if(err){
        console.log(err);
      }
    });

    io.emit('update_position',{marker:latlng});
  });

  socket.on('session_step_into_checkpoint',function(data){
    //Cập nhật lại trạng thái của sesssion.
    var time_start = new Date();
    var query = `UPDATE POSITIONS_TRACKING SET status = JSON_REPLACE(status,'$[${data.checkpointIndex}].status',1,'$[${data.checkpointIndex}].time_start','${time_start}') WHERE id = ${data.sessionId}`;

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
    var query = `UPDATE POSITIONS_TRACKING SET status = JSON_REPLACE(status,'$[${data.checkpointIndex}].status',2,'$[${data.checkpointIndex}].time_end','${time_end}','$[${data.checkpointIndex}].total_time','${data.total_time}') WHERE id = ${data.sessionId}`;

    db.query(query,function(err,result){
      if(err){
        console.log(err);
      }else{
        io.emit('session_step_out_checkpoint',{data:data});
      }
    });

  });

  socket.on('stop_traking',function(data){
    var sql_update = `UPDATE POSITIONS_TRACKING SET type= 0 WHERE id = ${data.sessionId}`;
    db.query(sql_update,function(err,result){
      if(err){
        console.log(err);
      }else{
        io.emit('stop_tracking',{sessionId:data.sessionId});
      }
    });

  });

});
