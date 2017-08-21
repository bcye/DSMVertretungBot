const TelegramBot = require('node-telegram-bot-api');
const bot = new TelegramBot(process.env.API_KEY, {
  polling: true
});

const PROJECT_ID = 'dsmvertretungbot';
const firebase = require('firebase');
firebase.initializeApp({
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: PROJECT_ID + '.firebaseapp.com',
  databaseURL: 'https://' + PROJECT_ID + '.firebaseio.com',
  storageBucket: 'https://' + PROJECT_ID + '.appspot.com',
  messagingSenderId: process.env.MESSAGING_SENDER_ID
});
const users = firebase.database().ref('users');
const table = firebase.database().ref('table');

const tabletojson = require('tabletojson');
const request = require('request');

const URL = 'http://dsmadrid.org/wp-content/uploads/sustituciones/dsm-vertretungp-klassen-heute.htm';

bot.onText(/^(\/help|\/start)/, (msg, match) => {
  bot.sendMessage(msg.chat.id, 'Welcome to this bot. To create an account, send the /create command followed by your class and preferred time separated by spaces, for example: `/create 10f 08:10`\nYou can also /delete your account and /update it with the same arguments as /create.\nTo see your currents substitutions, you can /get them anytime', {
    'parse_mode': 'Markdown'
  });
});

bot.onText(/^\/create$/, (msg, match) => {
  bot.sendMessage(msg.chat.id, 'To create your account, you have to provide your class and preferred time!');
});
bot.onText(/^\/create (.+)/, (msg, match) => {
  if (/\d{1,2}\w \d\d:\d\d/.test(match[1])) {

    const args = match[1].split(' ');

    users.once('value', usersData => {
      var exists = false;
      for (var i in usersData.val()) {
        if (usersData.val()[i].id === msg.chat.id) {
          exists = true;
          break;
        }
      }

      if (!exists) {
        users.push({
          id: msg.chat.id,
          class: args[0],
          time: args[1]
        });

        bot.sendMessage(msg.chat.id, 'Account created');
      } else {
        bot.sendMessage(msg.chat.id, 'Account exists already!\nDo you want to /update?');
      }
    });
  } else {
    bot.sendMessage(msg.chat.id, 'Wrong class or time format!');
  }
});

bot.onText(/^\/update$/, (msg, match) => {
  bot.sendMessage(msg.chat.id, 'To update your account, you have to provide your class and preferred time!');
});
bot.onText(/^\/update (.+)/, (msg, match) => {
  if (/\d{1,2}\w \d\d:\d\d/.test(match[1])) {
    const args = match[1].split(' ');

    users.once('value', usersData => {
      var exists = false;
      for (var i in usersData.val()) {
        if (usersData.val()[i].id === msg.chat.id) {
          users.child(i).update({
            class: args[0],
            time: args[1]
          });
          exists = true;
          break;
        }
      }

      if (exists) {
        bot.sendMessage(msg.chat.id, 'Account updated');
      } else {
        bot.sendMessage(msg.chat.id, 'Account doesn\'t exist!\nDo you want to /create an account?');
      }
    });
  } else {
    bot.sendMessage(msg.chat.id, 'Wrong class or time format!');
  }
});

bot.onText(/^\/delete/, (msg, match) => {
  users.once('value', usersData => {
    var exists = false;
    for (var i in usersData.val()) {
      if (usersData.val()[i].id === msg.chat.id) {
        users.child(i).remove();
        exists = true;
        break;
      }
    }

    if (exists) {
      bot.sendMessage(msg.chat.id, 'Account deleted');
    } else {
      bot.sendMessage(msg.chat.id, 'Account doesn\'t exist!\nDo you want to /create an account?');
    }
  });
});

bot.onText(/^\/get/, (msg, match) => {
  sendVertretungen(msg.chat.id);
});

function sendVertretungen(id) {
  users.once('value', usersData => {
    var accountExists = false;

    for (var i in usersData.val()) {
      if (usersData.val()[i].id === id) {
        accountExists = true;

        table.once('value', tableData => {
          var substitutionExists = false;

          for (var j = 0; j < tableData.val().table.length; j++) {
            const eintrag = tableData.val().table[j];
            if (eintrag['Klasse(n)'] === usersData.val()[i].class) {
              substitutionExists = true;

              var message = '';
              if (eintrag['Stunde']) message += 'Stunde: ' + eintrag['Stunde'] + '\n';
              if (eintrag['Fach']) message += 'Fach: ' + eintrag['Fach'] + '\n';
              if (eintrag['Lehrer']) message += 'Lehrer: ' + eintrag['Lehrer'] + '\n';
              if (eintrag['(Fach)']) message += 'Statt Fach: ' + eintrag['(Fach)'] + '\n';
              if (eintrag['(Lehrer)']) message += 'Statt Lehrer: ' + eintrag['(Lehrer)'] + '\n';
              if (eintrag['Raum'] != '---') message += 'Raum: ' + eintrag['Raum'] + '\n';
              if (eintrag['Vertretungs-Text']) message += 'Mehr info: ' + eintrag['Vertretungs-Text'] + '\n';
              message.slice(0, -1);

              bot.sendMessage(id, message);
            }
          }

          if (!substitutionExists) {
            bot.sendMessage(id, 'No substitutions right now');
          }
        });
        break;
      }
    }

    if (!accountExists) {
      bot.sendMessage(msg.chat.id, 'Account doesn\'t exist!\nDo you want to /create an account?');
    }
  });
}

setInterval(function() {
  users.once('value', usersData => {
    for (var i in usersData.val()) {
      const now = new Date();
      if (usersData.val()[i].time == ('0' + (process.env.IS_HEROKU ? (now.getHours() + 2) % 24 : now.getHours())).slice(-2) + ':' + ('0' + now.getMinutes()).slice(-2)) {
        sendVertretungen(usersData.val()[i].id);
      }
    }
  });
}, 1000 * 60);

setInterval(function() {
  request(URL, (err, res, body) => {
    table.once('value', tableData => {
      const lastUpdate = require('moment')(/\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}/.exec(body)[0], 'DD-MM-YYYY HH-mm').toDate().getTime();

      if (tableData.val().lastSaved < lastUpdate) {
        tabletojson.convertUrl(URL, tables => {
          table.set({
            table: tables[1],
            lastSaved: lastUpdate
          });
        });
      }
    });
  });
}, 1000 * 60 * 10);
