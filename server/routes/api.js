const express = require('express');
const router = express.Router();
const ObjectID = require('mongodb').ObjectID;
const Anime = require('../models/anime.js')

// Response handling
let response = {
  status: 200,
  data: [],
  message: null
};

router.post('/removeAnimeFromCatalog', (req, res) => {
  Anime.findOne({ '_id': ObjectID(req.body.id)}, (err, anime) => {
    if (err) {
      res.json({ success: false, message: err })
    } else {
      anime.remove((err) => {
        if (err) {
          res.json({ success: false, message: err });
        } else {
          res.json({ success: true, message: 'Anime deleted!' });
        }
      })
    }
  })
});

router.post('/changeCategory', (req, res) => {
  Anime.findOneAndUpdate({ "_id": ObjectID(req.body.id) }, { $set: { category: req.body.category } }, (err, anime) => {
    if (err) {
      res.json({ success: false, message: err });
    } else {
      res.json({ success: true, message: "Category updated!" });
    }
  })
})

router.post('/fetchAnime', (req, res) => {
  Anime.find({ user: req.body.user, 'category': 'Want to Watch' }, (err, wwAnime) => {
    if (err) {
      res.json({ success: false, message: err });
    } else {
      Anime.find({ user: req.body.user, 'category': 'Considering' }, (err, cAnime) => {
        if (err) {
          res.json({ success: false, message: err });
        } else {
          Anime.find({ user: req.body.user, 'category': 'Completed' }, (err, compAnime) => {
            if (err) {
              res.json({ success: false, message: err });
            } else {
              res.json({ success: true, 'wwAnime': wwAnime, 'cAnime': cAnime, 'compAnime': compAnime});
            }
          })
        }
      })
    }
  })
})

router.post('/malSearch', (req, res) => {
  const query = encodeURIComponent(req["body"]["query"]);
  const parser = require('xml2json');
  const request = require('request');
  request.get({url: 'https://area11-burn:yuibestgirl4ever@myanimelist.net/api/anime/search.xml?q=' + query}, function (err, response, body) {
    if (!err) {
      let jsonString = parser.toJson(body);
      res.json({ success: true, data: JSON.parse(jsonString.toString())["anime"]["entry"] });
    } else {
      res.json({ success: false, message: err.toString()})
      return;   // We need this because of a weird error that happens in express due to the way errors are handled
    }
  });
});

router.post('/addAnimeToCatalog', (req, res) => {
  const anime = req.body.anime;
  const cat = req.body.category;
  // First check to make sure they haven't added this anime already
  Anime.findOne({ user: anime['user'], name: anime['name']}, (err, anime) => {
    if (err) {
      res.json({ success: false, message: err })
    } else if (anime) {
      res.json({ success: false, message: 'Anime already in catalog'});
    } else {
      Anime.findOne({ user: anime['user'], malID: anime['malID']}, (err, anime) => {
        if (err) {
          res.json({ success: false, message: err })
          return;
        } else if (anime) {
          res.json({ success: false, message: 'Anime already in catalog'});
          return;
        } else {
          let newAnime = new Anime({
            user: anime['user'],
            name: anime['name'],
            description: anime['description'],
            rating: anime['rating'],
            thumbnail: anime['thumbnail'],
            malID: anime['malID'],
            category: cat
          });
          newAnime.save((err) => {
            if (err) {
              res.json({ success: false, message: err });
            } else {
              res.json({ success: true, message: 'Anime added to catalog!' });
            }
          })
        }
      })
    }
  })
})


module.exports = router;
