const ObjectID = require('mongodb').ObjectID;
const Anime = require('../models/anime.js');
const User = require('../models/user.js');
const Group = require('../models/group.js');
const TopTens = require('../models/toptens.js');
const multer = require('multer');
const async = require('async');
const fs = require('fs');

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'public')
  },
  filename: function (req, file, cb) {
    // Distinguish between group & user uploads
    if (file.originalname == "area11-user-avatar") {
      cb(null, req.decoded.userId);
    } else {
      cb(null, file.originalname);
    }
  }
});

const upload = multer({ storage: storage });

module.exports = (router) => {

  router.post('/createGroup', (req, res) => {
    // Create group with current user as sole member
    let newGroup = new Group({
      "name": req.body.groupName,
      "members": [{
        id: req.decoded.userId,
        isPending: false,
      }]
    });
    newGroup.save((err) => {
      if (err) {
        res.json({ success: false, message: err });
      } else {
        // Also have to update users
        User.findOneAndUpdate({ "_id": ObjectID(req.decoded.userId) }, { $set: { group: req.body.groupName }}, (err, user) => {
          if (err || !user) {
            // Need to remove the group we just created if we couldn't complete the whole function
            Group.findOne({ "name": req.body.groupName }).remove().exec();
            res.json({ success: false, message: err});
          } else {
            res.json({ success: true, message: 'New group created!' });
          }
        });
      }
    });
  });

  router.post('/joinGroupRequest', (req, res) => {
    // Send a request to join a group; adds user as a group member with isPending = true
    Group.findOne({ name: req.body.groupName }, (err, group) => {
      if (err) {
        res.json({ success: false, message: err });
      } else if (!group) {
        res.json({ success: false, message: "No group found" });
      } else{
        // We want to let them know if they're already sent a request
        let found = false;
        for (let member of group.members) {
          if (req.decoded.userId == member.id && member.isPending) {
            found = true;
          }
        }
        if (found) {
          res.json({ success: false, message: "Already requested"});
        } else {
          let newMembers = group.members;
          newMembers.push({
            id: req.decoded.userId,
            isPending: true
          });
          Group.findOneAndUpdate({ name: req.body.groupName, }, { $set: { members: newMembers }}, (err, group) => {
            if (err) {
              res.json({ success: false, message: err });
            } else {
              res.json({ success: true, message: "Successfully requested membership!"})
            }
          })
        }
      }
    })
  });

  // Validation to make sure user is who he/she claims to be and is a member of the group
  router.use((req, res, next) => {
    User.findOne({ "_id": ObjectID(req.decoded.userId) }, (err, user) => {
      if (err) {
        res.json({ success: false, message: err });
      } else if (!user) {
        res.json({ success: false, message: "User not found" });
      } else {
        Group.findOne({ "name": req.body.groupName }, (err, group) => {
          if (err) {
            res.json({ success: false, message: err });
          } else if (!group && req.body.groupName) {
            // Group doesn't exist anymore--delete relevant info from user document
            User.findOneAndUpdate({ "_id": ObjectID(req.decoded.userId) }, { $set: { group: "" } }, (err, user) => {
              if (err) {
                res.json({ success: false, message: err });
              } else {
                res.json({ success: false, message: "No group found" });
              }
            });
          } else if (!group) {
            res.json({ success: false, message: "No group found" });
          } else {
            // First make sure that user is a part of this group
            let found = false;
            for (let member of group.members) {
              if (!member.isPending && member.id == req.decoded.userId) {
                found = true;
              }
            }
            if (!found) {
              User.findOneAndUpdate({ "_id": ObjectID(req.decoded.userId) }, { $set: { group: "" } }, (err, user) => {
                if (err) {
                  res.json({ success: false, message: err });
                } else {
                  res.json({ success: false, message: "Invalid group membership" });
                }
              });
            } else {
              // Everything is fine
              // Store username
              req.currentUsername = user.username;
              next();
            }
          }
        });
      }
    });
  });

  router.post('/upload', upload.single('uploadAvatar'), function(req, res) {
    // TODO: There must be a way to check if this failed somehow; right now we're just assuming it worked
    res.json( {"success": true} );
  });

  router.post('/leaveGroup', (req, res) => {
    // Remove current user from his/her associated group
    Group.findOne({ name: req.body.groupName }, (err, group) => {
      if (err) {
        res.json({ success: false, message: err });
      } else {
        let count = 0;
        let newMembers = [];
        for (let member of group.members) {
          if (!member.isPending) {
            count += 1;
          }
          if (member.id != req.decoded.userId) {
            newMembers.push(member);
          }
        }
        // If this was the only member, then remove group
        if (count == 1) {
          Group.findOne({ "name": req.body.groupName }).remove().exec();
          TopTens.find({ group: req.body.groupName }).remove().exec();
          fs.unlink('./public/' + req.body.groupName, (err) => {
            if (err) {
              // Don't return a success: false here becuase this will always fail when they haven't uploaded an avatar
              console.log(err);
            }
          });
          User.findOneAndUpdate({ "_id": ObjectID(req.decoded.userId) }, { $set: { group: "" } }, (err, user) => {
            if (err) {
              res.json({ success: false, message: err });
            } else {
              res.json({ success: true, message: "Left group successfully" });
            }
          })
        } else {
          Group.findOneAndUpdate({ "name": req.body.groupName }, { $set: { members: newMembers } }, (err, group) => {
            if (err) {
              res.json({ success: false, message: err });
            } else {
              User.findOneAndUpdate({ "_id": ObjectID(req.decoded.userId) }, { $set: { group: "" } }, (err, user) => {
                if (err) {
                  res.json({ success: false, message: err });
                } else {
                  // Update recommendations
                  Anime.update({ user: user.username, ownerIsRecommender: true }, { $set: { recommenders: [{ name: user.username }] } }, { multi: true }, (err) => {
                    if (err) {
                      res.json({ success: false, message: err });
                    } else {

                      let memberNames = [];
                      async.each(group.members, function getMemberName (member, done) {
                        if (!member.isPending && member.id != req.decoded.userId) {
                          User.findOne({ _id: ObjectID(member.id) }, (err, memberUser) => {
                            if (err) {
                              done();
                            } else if (!memberUser) {
                              done();
                            } else {
                              memberNames.push(memberUser.username);
                              done();
                            }
                          });
                        } else {
                          done();
                        }
                      }, function allDone (err) {
                        if (err) {
                          res.json({ success: false, message: err });
                        } else {
                          // Update top tens for group
                          TopTens.find({ group: group.name}, (err, ttList) => {
                            if (err) {
                              res.json({ success: false, message: err });
                            } else if (!ttList) {
                              Anime.update({ user: { $in: memberNames } }, { $pull: { recommenders: {name: user.username } } }, { multi: true }, (err) => {
                                if (err) {
                                  res.json({ success: false, message: err });
                                } else {
                                  res.json({ success: true, message: "Left group successfully" });
                                }
                              });
                            } else {
                              async.each(ttList, function(toptensObj, done2) {
                                if (!toptensObj.entries) {
                                  done2();
                                } else {
                                  let newEntries = [];
                                  for (let entry of toptensObj.entries) {
                                    let newEntry = {name: entry.name}
                                    let newViewerPrefs = [];
                                    for (let viewerPref of entry.viewerPrefs) {
                                      if (viewerPref.member != user.username) {
                                        newViewerPrefs.push(viewerPref)
                                      }
                                    }
                                    newEntry.viewerPrefs = newViewerPrefs;
                                    newEntries.push(newEntry);
                                  }
                                  TopTens.update({ "category": toptensObj.category, "user": toptensObj.user }, { entries: newEntries }, done2);
                                }
                              }, function allDone2(err) {
                                if (err) {
                                  res.json({ success: false, message: err });
                                } else {
                                  TopTens.find({ user: user.username }).remove().exec();
                                  // Update recommendations
                                  Anime.update({ user: { $in: memberNames } }, { $pull: { recommenders: {name: user.username } } }, { multi: true }, (err) => {
                                    if (err) {
                                      res.json({ success: false, message: err });
                                    } else {
                                      res.json({ success: true, message: "Left group successfully" });
                                    }
                                  });
                                }
                              });
                            }
                          });
                        }
                      });
                    }
                  });
                }
              });
            }
          });
        }
      }
    });
  });

  router.post('/rejectUserRequest', (req, res) => {
    Group.findOne({ "name": req.body.groupName }, (err, group) => {
      if (err) {
        res.json({ success: false, message: err });
      } else {
        // First check if user hasn't already been added
        for (let member of group.members) {
          if (req.body.pendingUser == member.id && !member.isPending) {
            res.json({ success: false, message: "Already in group" });
            return;
          }
        }
        let newMembers = [];
        for (let member of group.members) {
          if (member.id != req.body.pendingUser) {
            newMembers.push(member);
          }
        }
        Group.findOneAndUpdate( { "name": req.body.groupName }, { $set: { members: newMembers } }, (err, group) => {
          if (err) {
            res.json({ success: false, message: err });
          } else {
            res.json({ success: true, message: "Successfully rejected user" });
          }
        });
      }
    });
  });

  router.post('/acceptUserRequest', (req, res) => {
    Group.findOne({ "name": req.body.groupName }, (err, group) => {
      if (err) {
        res.json({ success: false, message: err });
      } else {
        // First check if user hasn't joined another group
        User.findOne({"_id": ObjectID(req.body.pendingUser) }, (err, pUser) => {
          if (err) {
            res.json({ success: false, message: err });
          } else if (!pUser) {
            res.json({ success: false, message: "User to add doesn't exist" });
          } else {
            if (pUser.group) {
              // Delete request
              let newMembers = [];
              for (memb of group.members) {
                if (memb.id != req.body.pendingUser) {
                  newMembers.push(memb)
                }
              }
              Group.findOneAndUpdate({ "name": req.body.groupName }, { $set: { members: newMembers } }, (err, group) => {
                if (err) {
                  res.json({ success: false, message: err });
                } else {
                  res.json({ success: false, message: "In different group" });
                }
              });
            } else {
              // Now check if user hasn't already been added to this group
              for (let member of group.members) {
                if (req.body.pendingUser == member.id && !member.isPending) {
                  res.json({ success: false, message: "Already in group" });
                  return;
                }
              }
              // Change isPending status to officially "add" user
              let newMembers = group.members;
              for (let i=0; i<newMembers.length; i++) {
                if (newMembers[i].id == req.body.pendingUser) {
                  newMembers[i].isPending = false;
                  break;
                }
              }
              Group.findOneAndUpdate({ "name": req.body.groupName }, { $set: { members: newMembers } }, (err, group) => {
                if (err) {
                  res.json({ success: false, message: err });
                } else {
                  // Remember to update new user also
                  User.findOneAndUpdate( { "_id": ObjectID(req.body.pendingUser) }, { $set: { group: req.body.groupName } }, (err, user) => {
                    if (err) {
                      res.json({ success: false, message: err });
                    } else {
                      // Now add recommendations from group anime' anime to new member
                      let memberNames = [];
                      let newMemberName = "";
                      async.each(group.members, function getMemberName (member, done) {
                        if (!member.isPending || member.id == req.body.pendingUser) {
                          User.findOne({ _id: ObjectID(member.id) }, (err, memberUser) => {
                            if (err) {
                              done();
                            } else if (!memberUser) {
                              done();
                            } else {
                              if (member.id != req.body.pendingUser) {
                                memberNames.push(memberUser.username);
                              } else {
                                newMemberName = memberUser.username;
                              }
                              done();
                            }
                          });
                        } else {
                          done();
                        }
                      }, function allDone (err) {
                        if (err) {
                          res.json({ success: false, message: err });
                        } else {
                          Anime.find({ user: { $in: memberNames } }, (err, groupAnimeList) => {
                            let malIDs = new Set();
                            async.eachSeries(groupAnimeList, function updateNewMemberRecommendations (groupMembAnime, done3) {
                              if (!groupMembAnime.malID || malIDs.has(groupMembAnime.malID) || !groupMembAnime.recommenders) {
                                done3()
                              } else {
                                malIDs.add(groupMembAnime.malID);
                                Anime.update({ malID: groupMembAnime.malID, user: newMemberName }, { $push: { recommenders: { $each: groupMembAnime.recommenders } } }, done3)
                              }
                            }, function allDone3 (err) {
                              if (err) {
                                res.json({ success: false, message: err });
                              } else {
                                // NOW do the converse, and add new group member's recommendations to all the existing group members' anime
                                Anime.find({ user: newMemberName }, (err, animeList) => {
                                  if (err) {
                                    res.json({ success: false, message: err });
                                  } else if (!animeList) {
                                    res.json({ success: true, message: "Successfully added to group" });
                                  } else {
                                    async.each(animeList, function updateRecommendations (membAnime, done2) {
                                      if (!membAnime.ownerIsRecommender || !membAnime.malID) {
                                        done2();
                                      } else {
                                        Anime.update({ malID: membAnime.malID, user: { $in: memberNames } }, { $push: { recommenders: { name: newMemberName } } }, { multi: true }, done2);
                                      }
                                    }, function allDone2 (err) {
                                      if (err) {
                                        res.json({ success: false, message: err });
                                      } else {
                                        // Now we have to update TopTens info
                                        // Update top tens for group
                                        TopTens.find({ group: group.name }, (err, ttList) => {
                                          if (err) {
                                            res.json({ success: false, message: err });
                                          } else if (!ttList) {
                                            res.json({ success: true, message: "Successfully added to group" });
                                          } else {
                                            async.each(ttList, function(toptensObj, done4) {
                                              if (!toptensObj.entries) {
                                                done4();
                                              } else {
                                                let newEntries = [];
                                                for (let entry of toptensObj.entries) {
                                                  let newEntry = {name: entry.name}
                                                  let newViewerPrefs = [];
                                                  for (let viewerPref of entry.viewerPrefs) {
                                                    newViewerPrefs.push(viewerPref)
                                                  }
                                                  newViewerPrefs.push({ member: newMemberName, shouldHide: false })
                                                  newEntry.viewerPrefs = newViewerPrefs;
                                                  newEntries.push(newEntry);
                                                }
                                                TopTens.update({ "category": toptensObj.category, "user": toptensObj.user }, { entries: newEntries }, done4);
                                              }
                                            }, function allDone4(err) {
                                              if (err) {
                                                res.json({ success: false, message: err });
                                              } else {
                                                res.json({ success: true, message: "Successfully added to group" });
                                              }
                                            });
                                          }
                                        });
                                      }
                                    });
                                  }
                                });
                              }
                            });
                          });
                        }
                      });
                    }
                  });
                }
              });
            }
          }
        });
      }
    });
  });

  router.post('/getGroupInfo', (req, res) => {
    Group.findOne({ "name": req.body.groupName }, (err, group) => {
      if (err) {
        res.json({ success: false, message: err });
      } else {
        // Query for group member data
        // Use map because later we'll need to remember isPending status
        let groupMembers = [];
        let groupMemberMap = new Map();
        for (let member of group.members) {
          groupMembers.push(ObjectID(member.id));
          groupMemberMap.set(member.id, member.isPending);
        }
        User.find({ "_id": { $in: groupMembers } }, (err, members) => {
          if (err) {
            res.json({ success: false, message: err });
          } else if (members) {
            // Need to modify members so we can remove password and include isPending
            let newMembers = [];
            let currentShowsMap = {};

            async.each(members, function(member, done) {
              // Additional query to get each member's current show
              // TODO: This is probably not the smartest way to do this, but I'm not
              // sure if adding "current show" to the user schema is a better route atm
              Anime.find({user: member.username, isFinalist: true}, (err, animeList) => {
                if (err) {
                  res.json({ success: false, message: err })
                } else {
                  newMembers.push({
                    id: member.id,
                    username: member.username,
                    bestgirl: member.bestgirl,
                    bioDisplay: member.bioDisplay,
                    avatar: (member.avatar ? member.avatar : ""),
                    bestboy: (member.bestboy ? member.bestboy : ""),
                    isPending: groupMemberMap.get(member.id)
                  });
                  if (animeList && animeList.length && animeList.length == 1) {
                    currentShowsMap[member.username] = animeList[0]["name"];
                  } else {
                    currentShowsMap[member.username] = "N/A";
                  }
                  done();
                }
              })
            }, function allDone(err) {
              if (err) {
                res.json({ success: false, message: err });
              } else {
                let groupObj = {
                  name: group.name,
                  members: newMembers,
                  countdown: group.countdown
                }
                res.json({ success: true, group: groupObj, currentlyWatching: currentShowsMap})
              }
            });
          } else {
            res.json({ success: false, message: "Unknown error in /getGroupInfo" })
          }
        });
      }
    });
  });

  router.post('/saveGroupChanges', (req, res) => {
    console.log(req.body);
    Group.findOneAndUpdate({ name: req.body.groupName }, { $set: { name: req.body.groupChangesModel.name, countdown: req.body.groupChangesModel.countdown } }, (err, group) => {
      if (err) {
        res.json({ success: false, message: err });
      } else if (req.body.groupName != req.body.groupChangesModel.name) {
        // If they changed the group name we have additional steps to take
        User.update({ group: req.body.groupName }, { $set: { group: req.body.groupChangesModel.name } }, {multi: true}, (err) => {
          if (err) {
            res.json({ success: false, message: err });
          } else {
            fs.rename('./public/' + req.body.groupName, './public/' + req.body.groupChangesModel.name, (err) => {
              if (err) {
                // Don't return a success: false here becuase this will always fail when they haven't uploaded an avatar
                console.log(err)
              }
              TopTens.update({ group: req.body.groupName }, { $set: { group: req.body.groupChangesModel.name } }, { multi: true }, (err) => {
                if (err) {
                  res.json({ success: false, message: err });
                } else {
                  res.json({ success: true, message: "Group changes saved successfully!" });
                }
              });
            });
          }
        });
      } else {
        res.json({ success: true, message: "Group changes saved successfully!" });
      }
    });
  });

  router.post('/disbandGroup', (req, res) => {
    Group.findOne({ "name": req.body.groupName }, (err, group) => {
      if (err) {
        res.json({ success: false, message: err });
      } else {
        Group.findOne({ "name": req.body.groupName }).remove().exec();
        fs.unlink('./public/' + req.body.groupName, (err) => {
          if (err) {
            // Don't return a success: false here becuase this will always fail when they haven't uploaded an avatar
            console.log(err);
          }
        });

        // Update anime recommendations
        let memberNames = [];
        async.each(group.members, function getMemberName (member, done) {
          if (!member.isPending) {
            User.findOne({ _id: ObjectID(member.id) }, (err, memberUser) => {
              if (err) {
                done();
              } else if (!memberUser) {
                done();
              } else {
                memberNames.push(memberUser.username);
                done();
              }
            });
          } else {
            done();
          }
        }, function allDone (err) {
          if (err) {
            res.json({ success: false, message: err });
          } else {
            Anime.update({ user: { $in: memberNames }, ownerIsRecommender: false }, { $set: { recommenders: [] } }, { multi: true }, (err) => {
              if (err) {
                res.json({ success: false, message: err });
              } else {
                async.each(memberNames, function updateMemberRecommendations (memberName, done) {
                  Anime.update({ user: memberName, ownerIsRecommender: true }, { $set: { recommenders: [{ name: memberName }] } }, { multi: true }, done);
                }, function allDone (err) {
                  if (err) {
                    res.json({ success: false, message: err });
                  } else {
                    TopTens.find({ group: group.name }).remove().exec();
                    res.json({ success: true, message: "Group successfully deleted" });
                  }
                });
              }
            });
          }
        });
      }
    });

  });

  router.post('/fetchImportableAnime', (req, res) => {
    // First check to make sure current user is in the same group as fromUser
    Group.findOne({ "name": req.body.groupName }, (err, group) => {
      if (err) {
        res.json({ success: false, message: err });
      } else {
        let found1 = false;
        let found2 = false;
        for (let member of group.members) {
          if (!member.isPending && member.id == req.decoded.userId) {
            found1 = true;
          } else if (!member.isPending && member.id == req.body.fromUserID) {
            found2 = true;
          }
        }
        if (!found1 || !found2) {
          res.json({ success: false, message: "Users not in same group" });
        } else {
          Anime.find({ "user": req.body.fromUser }, (err, fromUserList) => {
            if (err) {
              res.json({ success: false, message: err });
            } else {
              if (!fromUserList) {
                res.json({ success: false, message: "Nothing to import"});
              } else {
                // Add each not-already-existing MAL-linked anime
                let importableAnime = [];
                async.each(fromUserList, function updateAnime (anime, done) {
                  if (anime["malID"]) {
                    Anime.findOne({ "malID":  anime["malID"], "user": req.body.toUser }, (err, existingAnime) => {
                      done();
                      if (err) {
                        return;
                      } else if (!existingAnime) {
                        importableAnime.push(anime)
                      }
                    });
                  } else {
                    done();
                  }
                }, function allDone (err) {
                  if (err) {
                    res.json({ success: false, message: err });
                  } else {
                    // Because of the slightly hacky use of done() we wait half a second to make sure it's done running
                    setTimeout(() => {
                      res.json({ success: true, importableAnime: importableAnime });
                    }, 500)
                  }
                });
              }
            }
          });
        }
      }
    });
  });

  router.post('/importAnime', (req, res) => {
    // Saves list of anime that user selected from group member's catalog to user's catalog
    User.findOne({ "_id": ObjectID(req.decoded.userId) }, (err, user) => {
      if (err) {
        res.json({ success: false, message: err });
      } else {
        async.each(req.body.animeList, function saveAnime (anime, done) {
          const newAnime = new Anime({
            user: user.username,
            name: anime['name'],
            description: anime['description'],
            rating: anime['rating'],
            thumbnail: anime['thumbnail'],
            malID: anime['malID'],
            category: 'Considering',
            isFinalist: false,
            genres: anime['genres'],
            startDate: anime['startDate'],
            endDate: anime['endDate'],
            type: anime['type'],
            englishTitle: anime['englishTitle'],
            status: anime['status'],
            recommenders: anime['recommenders'],
            studios: anime["studios"],
            runtime: anime["runtime"]
          });
          newAnime.save(done);
        }, function allDone(err) {
          if (err) {
            res.json({ success: false, message: err });
          } else {
            res.json({ success: true, message: "Successfully imported anime!" });
          }
        });
      }
    });
  });

  router.post('/importCatalog', (req, res) => {
    // Adds all not-already-existing anime from one group member's catalog to another's 'Considering' category
    // First check to make sure current user is in the same group as fromUser
    Group.findOne({ "name": req.body.groupName }, (err, group) => {
      if (err) {
        res.json({ success: false, message: err });
      } else {
        let found1 = false;
        let found2 = false;
        for (let member of group.members) {
          if (!member.isPending && member.id == req.decoded.userId) {
            found1 = true;
          } else if (!member.isPending && member.id == req.body.fromUserID) {
            found2 = true;
          }
        }
        if (!found1 || !found2) {
          res.json({ success: false, message: "Users not in same group" });
        } else {
          Anime.find({ "user": req.body.fromUser }, (err, fromUserList) => {
            if (err) {
              res.json({ success: false, message: err });
            } else {
              if (!fromUserList) {
                res.json({ success: false, message: "Nothing to import"});
              } else {
                // Import each not-already-existing MAL-linked anime
                let numOfImports = 0;
                async.each(fromUserList, function updateAnime (anime, done) {
                  if (anime["malID"]) {
                    Anime.findOne({ "malID":  anime["malID"], "user": req.body.toUser }, (err, existingAnime) => {
                      done();
                      if (err) {
                        return;
                      } else if (!existingAnime) {
                        numOfImports += 1;
                        const newAnime = new Anime({
                          user: req.body.toUser,
                          name: anime['name'],
                          description: anime['description'],
                          rating: anime['rating'],
                          thumbnail: anime['thumbnail'],
                          malID: anime['malID'],
                          category: 'Considering',
                          isFinalist: false,
                          genres: anime['genres'],
                          startDate: anime['startDate'],
                          endDate: anime['endDate'],
                          type: anime['type'],
                          englishTitle: anime['englishTitle'],
                          status: anime['status'],
                          recommenders: anime['recommenders'],
                          studios: anime['studios']
                        });
                        newAnime.save((err) => {
                          if (err) {
                            console.log(err);
                            return;
                          }
                        });
                      }
                    });
                  } else {
                    done();
                  }
                }, function allDone (err) {
                  if (err) {
                    res.json({ success: false, message: err });
                  } else {
                    // If there are a higher number of anime the count can be a litte off, so we wait for .5 sec
                    setTimeout(() => {
                      res.json({ success: true, message: numOfImports });
                    }, 500)
                  }
                });
              }
            }
          });
        }
      }
    });
  });

  router.post('/getGroupMemberAnime', (req, res) => {
    // Get completed anime of each group member
    Group.findOne({ "name": req.body.groupName }, (err, group) => {
      if (err) {
        res.json({ success: false, message: err });
      } else {
        // Query for group member data
        let groupMembers = [];
        for (let member of group.members) {
          if (member.id !== req.decoded.userId && !member.isPending) {
            groupMembers.push(ObjectID(member.id));
          }
        }
        User.find({ "_id": { $in: groupMembers } }, (err, members) => {
          if (err) {
            res.json({ success: false, message: err });
          } else if (members) {
            let memberNames = [];
            for (let member of members) {
              memberNames.push(member.username);
            }
            Anime.find({ "user": { $in: memberNames }, "category": "Completed" }, (err, anime) => {
              if (err) {
                res.json({ success: false, message: err });
              } else {
                res.json({ success: true, anime: anime });
              }
            });
          } else {
            res.json({ success: false, message: "Unknown error in /getGroupInfo" })
          }
        });
      }
    });
  });

  return router;
}
