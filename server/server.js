var mysql = require('mysql');
var fs = require('fs');
var logInfo = fs.createWriteStream('info.txt', {'flags': 'a'});
var logError = fs.createWriteStream('error.txt',{'flags':'a'});
var logHistory = fs.createWriteStream('history.txt',{'flags':'a'});
var moment = require('moment');
var app = require('http').createServer(handler);
var io = require('socket.io')(app);
var axios = require('axios');
app.listen(3000,function(){
  console.log('\x1b[36m%s\x1b[0m',`
   /$$    /$$                        /$$$$$                      /$$$$$$
  | $$   | $$                       |__  $$                     /$$__  $$
  | $$   | $$                          | $$                    | $$  \__/
  |  $$ / $$/       /$$$$$$            | $$       /$$$$$$      |  $$$$$$
   \  $$ $$/       |______/       /$$  | $$      |______/       \____  $$
    \  $$$/                      | $$  | $$                     /$$  \ $$
     \  $/                       |  $$$$$$/                    |  $$$$$$/
      \_/                         \______/                      \______/
  `)
  console.log('Initialize successful');
  console.log('........');
  logInfo.write('[' + new Date() + ']: ' + 'Initialize server\n');
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

// var db = mysql.createConnection({
//     host: '127.0.0.1',
//     user: 'root',
//     password:'phamnhuy151192',
//     database: 'erp',
//     dateStrings:true,
//     port:'3306'
// });
//
// db.connect(function(err){
//     if (err) console.log(err)
// });

var db_config = {
    host: '127.0.0.1',
    user: 'root',
    password: 'phamnhuy151192',
    database: 'realtime_location_tracking',
    dateStrings:true,
    port:'3306'
};

var db;

function handleDisconnect() {
  db = mysql.createConnection(db_config); // Recreate the connection, since
                                                  // the old one cannot be reused.

  db.connect(function(err) {              // The server is either down
    if(err) {                                     // or restarting (takes a while sometimes).
      //console.log('error when connecting to db:', err);
      logError.write('[' + new Date() + ']: Error when connecting to db=====\n');
      logError.write(err);
      logError.write('\n');
      setTimeout(handleDisconnect, 2000); // We introduce a delay before attempting to reconnect,
    }                                     // to avoid a hot loop, and to allow our node script to
  });                                     // process asynchronous requests in the meantime.
                                          // If you're also serving http, display a 503 error.
  db.on('error', function(err) {
    //console.log('db error', err);
    logError.write('[' + new Date() + ']: Database error =====\n');
    logError.write(err);
    logError.write('\n');
    if(err.code === 'PROTOCOL_CONNECTION_LOST') { // Connection to the MySQL server is usually
      handleDisconnect();                         // lost due to either server restart, or a
    } else {                                      // connnection idle timeout (the wait_timeout
      throw err;                                  // server variable configures this)
    }
  });
}

handleDisconnect();
io.on('connection', function (socket) {
  logHistory.write('[' + new Date() + `]: Had new connection-> ${socket.id} \n`);
  logHistory.write('\n');
  socket.emit('connected_success', "connect_success");
  socket.on('new_car_tracking_detected', function (data) {
    logHistory.write('[' + new Date() + `]: New session tracking detected ${data.object_name} \n`);
    logHistory.write('\n');

    var checkpoints = JSON.parse(data.checkpoint);

    var listCp = [];

    for(i=0;i< checkpoints.length ; i++){
      var cp = {
        checkpointId: checkpoints[i].id,
        max_time:checkpoints[i].time,
        status:0,
        time_start:'',
        time_end:'',
        total_time:0
      }

      listCp.push(cp)

    }
    let status = JSON.stringify(listCp);

    let color = getRandomColor();

    var sql = `INSERT INTO TRACKING_LOGGER (object_tracking,type,path,timeline,status,current_position,path_color,mode_id,object_id) VALUES('${data.object_name}',1,'[]','[]','${status}','{"lat":${data.lat},"lng":${data.lng}}','${color}','${data.mode_id}','${data.object_id}')`;
    db.query(sql, function (err, result) {
        if (err) {//log lỗi
          //console.log(err);
          logError.write('[' + new Date() + ']: Error when create new session=====\n');
          logError.write(err);
          logError.write('\n');
        }else{
            socket.emit('create_tracking_session',{
              status:201,
              id:`${result.insertId}`
            });

            var ss = `SELECT * FROM TRACKING_LOGGER WHERE id = ${result.insertId}`;

            db.query(ss,function(errr,resultt){
              if(errr){
                //console.log(errr);
                logError.write('[' + new Date() + `]: Error when retry data of session ${result.insertId} =====\n`);
                logError.write(errr);
                logError.write('\n');
              }else{
                io.emit('new_session_detected_in_mode_' + data.mode_id,{data:JSON.stringify(resultt[0])});
                io.emit('start_new_marker',{data:JSON.stringify(resultt[0])});
              }
            });

        }
    });

  });//new car tracking session

  socket.on('update_location',function(data,listStopPositions=0,sessionId=0){
    let time = moment().format('YYYY-MM-DD HH:mm:ss');
    var sessionId = sessionId? sessionId: data.sessionId;
    var latlng = {
      lat:data.lat,
      lng:data.lng
    };

    io.emit('location_change',{position:latlng,id:sessionId});

    if(listStopPositions.length >0){
      for(let i=0; i<listStopPositions.length ; i++){
        let ob = listStopPositions[i];
        let q = `UPDATE TRACKING_LOGGER SET path = JSON_ARRAY_APPEND(path,'$','{"lat":${ob.lat},"lng":${ob.lng},"speed":0,"time_at":"${ob.time_at}"}') WHERE ID = ${sessionId}` ;
        db.query(q,function(err,result){
          if(err){
            logError.write('[' + new Date() + `]: Error when update location =====\n`);
            logError.write(err);
            logError.write('\n');
          }
        });
      }
    }


    var query = `UPDATE TRACKING_LOGGER SET path = JSON_ARRAY_APPEND(path,'$','{"lat":${data.lat},"lng":${data.lng},"speed":${data.speed},"time_at":"${time}"}'), current_position = '{"lat":${data.lat},"lng":${data.lng}}' WHERE ID = ${sessionId}` ;
    db.query(query,function(err,result){
      if(err){
        //console.log(err);
        logError.write('[' + new Date() + `]: Error when update location =====\n`);
        logError.write(err);
        logError.write('\n');
      }
    });


  });

  socket.on('step_into_checkpoint',function(data){
    //Cập nhật lại trạng thái của sesssion.
    var time_start = new Date();
    var timesql = moment().format('YYYY-MM-DD HH:mm:ss');
    var query = `UPDATE TRACKING_LOGGER SET  timeline= JSON_ARRAY_APPEND(timeline,'$','{"checkpointID":${data.checkpointId},"time_at":"${timesql}","type":1}') , status = JSON_REPLACE(status,'$[${data.checkpointIndex}].status',1,'$[${data.checkpointIndex}].time_start','${time_start}') WHERE id = ${data.sessionId}`;
    db.query(query,function(err,result){
      if(err){
        //console.log(err);
        logError.write('[' + new Date() + `]: Error when update object step into checkpoint =====\n`);
        logError.write(err);
        logError.write('\n');
      }else{
        io.emit('step_into_checkpoint',{data});
      }
    });

  });

  socket.on('session_step_out_checkpoint',function(data){
    var time_end = new Date();
    var timesql = moment().format('YYYY-MM-DD HH:mm:ss');
    var query = `UPDATE TRACKING_LOGGER SET timeline = JSON_ARRAY_APPEND(timeline,'$','{"checkpointID":${data.checkpointId},"time_at":"${timesql}","type":0}'), status = JSON_REPLACE(status,'$[${data.checkpointIndex}].status',2,'$[${data.checkpointIndex}].time_end','${time_end}','$[${data.checkpointIndex}].total_time','${data.total_time}') WHERE id = ${data.sessionId}`;

    db.query(query,function(err,result){
      if(err){
        //console.log(err);
        logError.write('[' + new Date() + `]: Error when update object step out checkpoint =====\n`);
        logError.write(err);
        logError.write('\n');
      }else{
        io.emit('session_step_out_checkpoint',{data});
      }
    });

  });

  socket.on('stop_traking',function(data){
    if(data == "undefined"){
      logError.write('[' + new Date() + `]: sTop Tracking but data undefined =====\n`);
      return;
    }
    logError.write('[' + new Date() + `]: Stop Tracking ${data.sessionId}\n`);

    let mysqlTimestamp = moment(Date.now()).format('YYYY-MM-DD HH:mm:ss');
    let sql_update = `UPDATE TRACKING_LOGGER SET type= 0,ended_at = '${mysqlTimestamp}' WHERE id = ${data.sessionId}`;
    db.query(sql_update,function(err,result){
      if(err){
        console.log(err);
        logError.write('[' + new Date() + `]: Error update data when stop tracking=====\n`);
        logError.write(err);
        logError.write('\n');
      }else{
        io.emit('stop_tracking_in_' + data.mode_id,{sessionId:data.sessionId});
        io.emit('remove_marker',{sessionId:data.sessionId});
        axios.get('http://127.0.0.1:8092/api/v1/email/'+data.sessionId)
          .then(function(response) {
            if(response.data ==1){
              logHistory.write('[' + new Date() + `]: Send Email: ${response.data} \n`);
              logHistory.write('\n');
            }else{
              logError.write('[' + new Date() + `]: Send email error\n`);
            }
        }).catch(function(err){
          logError.write('[' + new Date() + `]: Send email error\n`);
          logError.write(err);
          logError.write('\n');
        });

        logHistory.write('[' + new Date() + `]: Stop tracking ${data.sessionId} \n`);
        logHistory.write('\n');
      }
    });
  });

  socket.on('disconnect', function() {
      logHistory.write('[' + new Date() + `]: Connection disconnected-> ${socket.id} \n`);
      logHistory.write('\n');
   });

});
