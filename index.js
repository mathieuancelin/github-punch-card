const express = require('express');
const moment = require('moment');
const _ = require('lodash');
const fetch = require('node-fetch');
const app = express();
const PORT = process.env.PORT || 8080;
const TOKEN = process.env.GITHUB_TOKEN;

// TODO : redis cache ?
// TODO : support multi repo

const cache = {};
let limit = 0;
let remaining = 0;
let awaitPerCall = 0;
let reset = moment();
let duration = moment();

function fetchAllPages(repo, from, to, token) {
  const key = `https://api.github.com/repos/${repo}/commits?since=${from.format()}&until=${to.format()}`; 
  console.log('Fetching stats for', key); 
  if (cache[key]) {
    return new Promise(s => s(cache[key]));
  }

  let commits = {};
  const pages = _.range(9999);
  return new Promise((s, e) => {
    function fetchNext() {
      const page = pages.shift();
      const url = `https://api.github.com/repos/${repo}/commits?since=${from.format()}&until=${to.format()}&page=${page}`;      
      setTimeout(() => {
        fetch(url, {
          headers: {
            'Authorization': `token ${token}`
          }
        }).then(r => {
          if (token === TOKEN) {
            const headers = r.headers.raw();
            limit = headers['x-ratelimit-limit'][0];
            remaining = headers['x-ratelimit-remaining'][0];
            reset = moment(headers['x-ratelimit-reset'] * 1000);
            duration = moment.duration(moment().diff(reset));
            awaitPerCall = (Math.abs(duration.asMilliseconds()) / remaining).toFixed(0);
            if (awaitPerCall < 0) {
              awaitPerCall = 0;
            }
            if (awaitPerCall > 1000) {
              console.log('Too much time to await between each call, hoping for the best :(', awaitPerCall);
              awaitPerCall = 1000;
            }
            console.log(remaining, 'calls remaining, will reset at', reset.format('YYYY-MM-DD'), '(ie. in', duration.humanize(), '), need to await', awaitPerCall, 'ms. per call');
          }
          return r.json();
        }).then(data => {
          const newCommits = data.map(c => c.commit.author.date).map(date => moment(date)).map(date => ({ day: date.day(), hour: date.hour(), key: `${date.day()} - ${date.hour()}`, value: 1 }));
          const groups = _.groupBy(newCommits, c => c.key);
          if (data.length > 0) {
            Object.keys(groups).map(group => {
              const arr = (commits[group] || []);
              const g = (groups[group] || []);
              commits[group] = [ ...arr, ...g ];
            });
            fetchNext();
          } else {
            cache[key] = commits;
            s(commits);
          }
        }).catch(e => {
          s([]);
        });
      }, awaitPerCall);
    }
    fetchNext();
  });
}

const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function fetchGithubData(repo, from, to, token) {
  return fetchAllPages(repo, from, to, token).then(data => {
    const commits = Object.keys(data).map(k => {
      const group = data[k];
      return { dayStr: days[group[0].day], y: group[0].day, x: group[0].hour, z: group.length };
    });
    return commits;
  }, () => []);
}

app.get('/', (req, res) => {
  const token = req.query.token || TOKEN;
  const repo = req.query.repo || 'facebook/react';
  const from = req.query.from ? moment(req.query.from, 'YYYY-MM-DD').startOf('day') : moment().subtract(8, 'days').startOf('day');
  let to = req.query.to ? moment(req.query.to, 'YYYY-MM-DD').startOf('day') : moment();
  if (to.isAfter(moment())) {
    to = moment();
  }
  fetchGithubData(repo, from, to, token).then(data => {
    res.status(200).type('html').send(view(data, repo, from, to));
  }, e => res.status(200).type('html').send('Error !!!'));
});

app.get('/stats.json', (req, res) => {
  res.status(200).type('json').send(Object.keys(cache));
});

app.listen(PORT, () => {
  console.log(`PunchCards listening on port ${PORT}!`);
});

function view(data, project, from, to) {
  return `<html>
  <head>
    <title>github-punch-card - ${project} - ${from.format('YYYY-MM-DD')} > ${to.format('YYYY-MM-DD')}</title>
    <script src="https://unpkg.com/jquery"></script>
    <script src="https://code.highcharts.com/highcharts.js"></script>
    <script src="https://code.highcharts.com/highcharts-more.js"></script>
    <script src="https://code.highcharts.com/modules/exporting.js"></script>
  </head>
  <body>
    <div id="punchcard"></div>
    <script>
      $(function() {
        
        var githubData = ${JSON.stringify(data)};
        
        var renderChart = function(data) {

          var days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
          var hours = ['0h', '1h', '2h', '3h', '4h', '5h', '6h', '7h', '8h', '9h', '10h', '11h', '12h', '13h', '14h', '15h', '16h', '17h', '18h', '19h', '20h', '21h', '22h', '23h'];
          
          Highcharts.chart('punchcard', {
            chart: {
              type: 'bubble',
              plotBorderWidth: 1,
              zoomType: 'xy',
              width: window.innerWidth - 15           
            },
            exporting: {
              width: window.innerWidth
            },
            legend: {
              enabled: false
            },
            credits: {
              enabled: false
            },
            title: {
              text: '${project} - ${from.format('YYYY-MM-DD')}/${to.format('YYYY-MM-DD')}'
            },
            xAxis: {
              gridLineWidth: 0,
              title: {
                enabled: false
              },
              categories: hours,
              max: 23,
              min: 0
            },
            yAxis: {
              startOnTick: false,
              endOnTick: false,
              maxPadding: 0.2,
              gridLineWidth: 0, 
              title: {
                enabled: false
              },     
              categories: days,
              max: 6,
              min: 0
            },
            tooltip: {
              enabled: false,
            },
            plotOptions: {
              series: {
                dataLabels: {
                  enabled: false,
                  format: '{point.name}'
                }
              }
            },
            tooltip: {
              useHTML: true,
              followPointer: true,
              headerFormat: '<span>',
              footerFormat: '</span>',
              pointFormat: '{point.dayStr} at {point.x}h - {point.z} commits',
            },
            series: [{
              color: 'black',
              data: githubData,
            }]
          });
        };

        renderChart(githubData);
      });
    </script>
    <script async src="https://www.googletagmanager.com/gtag/js?id=UA-108407029-1"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', 'UA-108407029-1');
    </script>    
  </body>
</html>`;
}