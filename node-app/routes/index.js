var express = require('express');
var path = require('path'); // 添加这行
var router = express.Router();

/* GET home page. */
router.get('/', function(req, res, next) {
   // 获取 URL 参数中的 model 值，如果没有则使用默认值
   const modelPath = req.query.model;
   const motionPath = req.query.motion;
  
   
});

/* GET transparent page */
router.get('/transparent', function(req, res, next) {
  // 获取URL参数
  const modelPath = req.query.model;
  const motionPath = req.query.motion;
  
  res.sendFile(path.join(__dirname, '../public/transparent.html'));
});


router.get('/examples', function(req, res, next) {
  res.sendFile(path.join(__dirname, '../three/examples', 'index.html'));
});

module.exports = router;
