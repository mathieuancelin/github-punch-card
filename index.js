const express = require('express');
const moment = require('moment');
const _ = require('lodash');
const fetch = require('node-fetch');
const app = express();
const PORT = process.env.PORT || 8080;
const TOKEN = process.env.GITHUB_TOKEN;

function fetchAllPages(repo, from, to) {
  let commits = {};
  const pages = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
  return new Promise((s, e) => {
    function fetchNext() {
      const page = pages.shift();
      const url = `https://api.github.com/repos/${repo}/commits?since=${from.format()}&until=${to.format()}&page=${page}`;
      fetch(url, {
        headers: {
          'Authorization': `token ${TOKEN}`
        }
      }).then(r => {
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
          s(commits);
        }
      }).catch(e => {
        s([]);
      });
    }
    fetchNext();
  });
}

const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function fetchGithubData(repo, from, to) {
  return fetchAllPages(repo, from, to).then(data => {
    const commits = Object.keys(data).map(k => {
      const group = data[k];
      return { dayStr: days[group[0].day], day: group[0].day, hour: group[0].hour, commits: group.length, y: group[0].day, x: group[0].hour, z: group.length };
    });
    return commits;
  }, () => []);
}

app.get('/', (req, res) => {
  const repo = req.query.repo || 'facebook/react';
  const from = req.query.from ? moment(req.query.from, 'YYYY-MM-DD').startOf('day') : moment().subtract(8, 'days').startOf('day');
  const to = req.query.to ? moment(req.query.to, 'YYYY-MM-DD').startOf('day') : moment().add(1, 'days').startOf('day');
  fetchGithubData(repo, from, to).then(data => {
    res.status(200).type('html').send(view(data, repo, from, to));
  }, e => res.status(200).type('html').send('Error !!!'));
});

app.listen(PORT, () => {
  console.log(`PunchCards listening on port ${PORT}!`);
});

function view(data, project) {
  return `<html>
  <head>
    <title>github-punch-card - ${project}</title>
    <script src="https://unpkg.com/jquery"></script>
    <script src="https://code.highcharts.com/highcharts.js"></script>
    <script src="https://code.highcharts.com/highcharts-more.js"></script>
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
              zoomType: 'xy'
            },
            legend: {
              enabled: false
            },
            credits: {
              enabled: false
            },
            title: {
              text: '${project}'
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
  </body>
</html>`;
}