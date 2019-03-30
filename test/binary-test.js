var assert = require('assert');
var exec = require('child_process').exec;
var fs = require('fs');
var http = require('http');
var path = require('path');
var url = require('url');

var httpProxy = require('http-proxy');
var lineBreak = require('os').EOL;
var SourceMapConsumer = require('source-map').SourceMapConsumer;
var vows = require('vows');

function binaryContext(options, context) {
  context.topic = function () {
    // We add __DIRECT__=1 to force binary into 'non-piped' mode
    exec('__DIRECT__=1 ./bin/cleancss ' + options, this.callback);
  };

  return context;
}

function pipedContext(css, options, context) {
  context.topic = function () {
    exec('echo "' + css + '" | ./bin/cleancss ' + options, this.callback);
  };

  return context;
}

function deleteFile(filename) {
  exec('rm ' + filename);
}

vows.describe('cleancss')
  .addBatch({
    'no options': binaryContext('', {
      'should output help': function (stdout) {
        assert.match(stdout, /Usage[:]/);
      }
    })
  })
  .addBatch({
    'help': binaryContext('-h', {
      'should output help': function (error, stdout) {
        assert.match(stdout, /Usage[:]/);
      },
      'should output one file example': function (error, stdout) {
        assert.include(stdout, 'cleancss -o one-min.css one.css');
      },
      'should output multiple files example': function (error, stdout) {
        assert.include(stdout, 'cleancss -o merged-and-minified.css one.css two.css three.css');
      },
      'should output gzipping multiple files example': function (error, stdout) {
        assert.include(stdout, 'cleancss one.css two.css three.css | gzip -9 -c > merged-minified-and-gzipped.css.gz');
      }
    })
  })
  .addBatch({
    'version': binaryContext('-v', {
      'should output help': function (error, stdout) {
        var version = JSON.parse(fs.readFileSync('./package.json', 'utf-8')).version;
        assert.equal(stdout, version + '\n');
      }
    })
  })
  .addBatch({
    'stdin': pipedContext('a{color: #f00}', '', {
      'should output data': function (error, stdout) {
        assert.equal(stdout, 'a{color:red}');
      }
    })
  })
  .addBatch({
    'format': pipedContext('a{color: #f00}', '--format beautify', {
      'outputs right styles': function (error, stdout) {
        assert.equal(stdout, 'a {\n  color: red\n}');
      }
    })
  })
  .addBatch({
    'strip all but first comment': pipedContext('/*!1st*//*! 2nd */a{display:block}', '-O1 specialComments:1', {
      'should keep the 2nd comment': function (error, stdout) {
        assert.equal(stdout, '/*!1st*/a{display:block}');
      }
    })
  })
  .addBatch({
    'strip all comments': pipedContext('/*!1st*//*! 2nd */a{display:block}', '-O1 specialComments:0', {
      'should keep the 2nd comment': function (error, stdout) {
        assert.equal(stdout, 'a{display:block}');
      }
    })
  })
  .addBatch({
    'piped with debug info': pipedContext('a{color: #f00;}', '-d', {
      'should output content to stdout and debug info to stderr': function (error, stdout, stderr) {
        assert.equal(stdout, 'a{color:red}');
        assert.notEqual(stderr, '');
        assert.include(stderr, 'Time spent:');
        assert.include(stderr, 'Original: 16 bytes');
        assert.include(stderr, 'Minified: 12 bytes');
        assert.include(stderr, 'Efficiency: 25%');
      }
    })
  })
  .addBatch({
    'piped with debug info on inlining': pipedContext('@import url(test/fixtures/imports-min.css);', '-d', {
      'should output inlining info': function (error, stdout, stderr) {
        assert.include(stderr, path.join(process.cwd(), 'test/fixtures/imports-min.css'));
      }
    })
  })
  .addBatch({
    'piped with correct debug info on inlining': pipedContext('@import url(test/fixtures/imports.css);', '-d', {
      'should output correct info': function (error, stdout, stderr) {
        assert.include(stderr, 'Original: 339 bytes');
        assert.include(stderr, 'Minified: 86 bytes');
        assert.include(stderr, 'Efficiency: 74.63%');
      }
    })
  })
  .addBatch({
    'to output file with debug info': pipedContext('a{color: #f00;}', '-d -o debug.css', {
      'should output nothing to stdout and debug info to stderr': function (error, stdout, stderr) {
        assert.isEmpty(stdout);
        assert.notEqual(stderr, '');
        assert.include(stderr, 'Time spent:');
        assert.include(stderr, 'Original: 16 bytes');
        assert.include(stderr, 'Minified: 12 bytes');
        assert.include(stderr, 'Efficiency: 25%');
      },
      'should output content to file': function () {
        var minimized = fs.readFileSync('debug.css', 'utf-8');
        assert.equal(minimized, 'a{color:red}');
      },
      teardown: function () {
        deleteFile('debug.css');
      }
    })
  })
  .addBatch({
    'skip level 2 optimizations': pipedContext('a{color:red}p{color:red}', '-O1', {
      'should do basic optimizations only': function (error, stdout) {
        assert.equal(stdout, 'a{color:red}p{color:red}');
      }
    })
  })
  .addBatch({
    'level 1 and 2 optimizations': pipedContext('a{font:16px "Arial"}a{color:red}', '-O1 all:false,removeQuotes:true -O2 all:false', {
      'should do basic optimizations only': function (error, stdout) {
        assert.equal(stdout, 'a{font:16px Arial}a{color:red}');
      }
    })
  })
  .addBatch({
    'enable restructuring optimizations': pipedContext('div{margin-top:0}.one{margin:0}.two{display:block;margin-top:0}', '-O2 restructureRules:on', {
      'should do basic optimizations only': function (error, stdout) {
        assert.equal(stdout, '.two,div{margin-top:0}.one{margin:0}.two{display:block}');
      }
    })
  })
  .addBatch({
    'no relative to path': binaryContext('./fixtures/partials-absolute/base.css', {
      'should not be able to resolve it fully': function (error, stdout, stderr) {
        assert.isEmpty(stdout);
        assert.notEqual(error, null);
        assert.notEqual(stderr, '');
      }
    })
  })
  .addBatch({
    'from source': binaryContext('--format keep-breaks -O2 ./test/fixtures/reset.css', {
      'should minimize': function (error, stdout) {
        var minimized = fs.readFileSync('./test/fixtures/reset-min.css', 'utf-8');
        assert.equal(stdout, minimized);
      }
    })
  })
  .addBatch({
    'from multiple sources': binaryContext('./test/fixtures/partials/one.css ./test/fixtures/partials/five.css', {
      'should minimize all': function (error, stdout) {
        assert.equal(stdout, '.one{color:red}.five{background:url(data:image/jpeg;base64,/9j/)}');
      }
    })
  })
  .addBatch({
    'to file': binaryContext('--format keep-breaks -O2 -o ./reset1-min.css ./test/fixtures/reset.css', {
      'should give no output': function (error, stdout) {
        assert.isEmpty(stdout);
      },
      'should minimize': function () {
        var preminified = fs.readFileSync('./test/fixtures/reset-min.css', 'utf-8');
        var minified = fs.readFileSync('./reset1-min.css', 'utf-8');
        assert.equal(minified, preminified);
      },
      teardown: function () {
        deleteFile('./reset1-min.css');
      }
    })
  })
  .addBatch({
    'disable @import': binaryContext('--inline none ./test/fixtures/imports.css', {
      'should disable the import processing': function (error, stdout) {
        assert.equal(stdout, '@import url(test/fixtures/partials/one.css);@import url(test/fixtures/partials/two.css);.imports{color:#000}');
      }
    })
  })
  .addBatch({
    'disable all @import': pipedContext('@import url(http://127.0.0.1/remote.css);@import url(test/fixtures/partials/one.css);', '--inline none', {
      'keeps original import rules': function (error, stdout) {
        assert.equal(stdout, '@import url(http://127.0.0.1/remote.css);@import url(test/fixtures/partials/one.css);');
      }
    }),
    'disable remote @import': pipedContext('@import url(http://127.0.0.1/remote.css);@import url(test/fixtures/partials/one.css);', '--inline !remote', {
      'keeps remote import rule': function (error, stdout) {
        assert.equal(stdout, '@import url(http://127.0.0.1/remote.css);.one{color:red}');
      }
    }),
    'disable remote @import as default': pipedContext('@import url(http://127.0.0.1/remote.css);@import url(test/fixtures/partials/one.css);', '', {
      'keeps remote import rule': function (error, stdout) {
        assert.equal(stdout, '@import url(http://127.0.0.1/remote.css);.one{color:red}');
      }
    }),
    'disable remote @import as default #2': pipedContext('@import url(http://127.0.0.1/remote.css);@import url(test/fixtures/partials/one.css);', '--inline', {
      'keeps remote import rule': function (error, stdout) {
        assert.equal(stdout, '@import url(http://127.0.0.1/remote.css);.one{color:red}');
      }
    }),
    'disable remote @import by host': pipedContext('@import url(http://127.0.0.1/remote.css);@import url(test/fixtures/partials/one.css);', '--inline !127.0.0.1', {
      'keeps remote import rule': function (error, stdout) {
        assert.equal(stdout, '@import url(http://127.0.0.1/remote.css);.one{color:red}');
      }
    })
  })
  .addBatch({
    'relative image paths': {
      'no output': binaryContext('./test/fixtures/partials-relative/base.css', {
        'should leave paths': function (error, stdout) {
          assert.equal(stdout, 'a{background:url(test/fixtures/partials/extra/down.gif) 0 0 no-repeat}');
        }
      }),
      'output': binaryContext('-o ./base1-min.css ./test/fixtures/partials-relative/base.css', {
        'should rewrite path relative to current path': function () {
          var minimized = fs.readFileSync('./base1-min.css', 'utf-8');
          assert.equal(minimized, 'a{background:url(test/fixtures/partials/extra/down.gif) 0 0 no-repeat}');
        },
        teardown: function () {
          deleteFile('./base1-min.css');
        }
      }),
      'piped with output': pipedContext('a{background:url(test/fixtures/partials/extra/down.gif)}', '-o base3-min.css', {
        'should keep paths as they are': function () {
          var minimized = fs.readFileSync('base3-min.css', 'utf-8');
          assert.equal(minimized, 'a{background:url(test/fixtures/partials/extra/down.gif)}');
        },
        teardown: function () {
          deleteFile('base3-min.css');
        }
      })
    }
  })
  .addBatch({
    'import rebasing': binaryContext('test/fixtures/partials/quoted-svg.css', {
      'should keep quoting intact': function (error, stdout) {
        assert.include(stdout, 'div{background:url("data:image');
        assert.include(stdout, 'svg%3E")}');
      }
    })
  })
  .addBatch({
    'complex import and url rebasing': {
      'absolute': binaryContext('./test/fixtures/rebasing/assets/ui.css', {
        'should rebase urls correctly': function (error, stdout) {
          assert.include(stdout, 'url(test/fixtures/rebasing/components/bootstrap/images/glyphs.gif)');
          assert.include(stdout, 'url(test/fixtures/rebasing/components/jquery-ui/images/prev.gif)');
          assert.include(stdout, 'url(test/fixtures/rebasing/components/jquery-ui/images/next.gif)');
        }
      }),
      'relative': binaryContext('-o test/ui.bundled.css ./test/fixtures/rebasing/assets/ui.css', {
        'should rebase urls correctly': function () {
          var minimized = fs.readFileSync('test/ui.bundled.css', 'utf-8');
          assert.include(minimized, 'url(fixtures/rebasing/components/bootstrap/images/glyphs.gif)');
          assert.include(minimized, 'url(fixtures/rebasing/components/jquery-ui/images/prev.gif)');
          assert.include(minimized, 'url(fixtures/rebasing/components/jquery-ui/images/next.gif)');
        },
        teardown: function () {
          deleteFile('test/ui.bundled.css');
        }
      })
    }
  })
  .addBatch({
    'complex import and skipped url rebasing': {
      'absolute': binaryContext('--skip-rebase ./test/fixtures/rebasing/assets/ui.css', {
        'should rebase urls correctly': function (error, stdout) {
          assert.isNull(error);
          assert.include(stdout, 'url(../images/glyphs.gif)');
          assert.include(stdout, 'url(../images/prev.gif)');
          assert.include(stdout, 'url(../images/next.gif)');
        }
      })
    }
  })
  .addBatch({
    'remote import': {
      topic: function () {
        this.server = http.createServer(function (req, res) {
          res.writeHead(200);
          res.end('p{font-size:13px}');
        }).listen(31991, '127.0.0.1');

        this.callback(null);
      },
      'of a file': binaryContext('http://127.0.0.1:31991/present.css', {
        succeeds: function (error, stdout) {
          assert.isNull(error);
          assert.equal(stdout, 'p{font-size:13px}');
        }
      }),
      teardown: function () {
        this.server.close();
      }
    }
  })
  .addBatch({
    'timeout': {
      topic: function () {
        var self = this;
        var source = '@import url(http://localhost:24682/timeout.css);';

        this.server = http.createServer(function () {
          setTimeout(function () {}, 1000);
        });
        this.server.listen('24682', function () {
          exec('echo "' + source + '" | ./bin/cleancss --inline all --inline-timeout 0.01', self.callback);
        });
      },
      'should raise warning': function (error, stdout, stderr) {
        assert.include(stderr, 'Broken @import declaration of "http://localhost:24682/timeout.css" - timeout');
      },
      'should output empty response': function (error, stdout) {
        assert.isEmpty(stdout);
      },
      teardown: function () {
        this.server.close();
      }
    }
  })
  .addBatch({
    'HTTP proxy': {
      topic: function () {
        var self = this;
        this.proxied = false;

        var proxy = httpProxy.createProxyServer();
        this.proxyServer = http.createServer(function (req, res) {
          self.proxied = true;
          proxy.web(req, res, { target: 'http://' + url.parse(req.url).host }, function () {});
        });
        this.proxyServer.listen(8081);

        this.server = http.createServer(function (req, res) {
          res.writeHead(200);
          res.end('a{color:red}');
        });
        this.server.listen(8080);

        exec('echo "@import url(http://127.0.0.1:8080/test.css);" | HTTP_PROXY=http://127.0.0.1:8081 ./bin/cleancss --inline all', this.callback);
      },
      'proxies the connection': function () {
        assert.isTrue(this.proxied);
      },
      'gives right output': function (error, stdout) {
        assert.equal(stdout, 'a{color:red}');
      },
      teardown: function () {
        this.proxyServer.close();
        this.server.close();
      }
    }
  })
  .addBatch({
    'ie7 compatibility': binaryContext('--format keep-breaks --compatibility ie7 ./test/fixtures/unsupported/selectors-ie7.css', {
      'should not transform source': function (error, stdout) {
        assert.equal(stdout, fs.readFileSync('./test/fixtures/unsupported/selectors-ie7.css', 'utf-8').trim());
      }
    })
  })
  .addBatch({
    'ie8 compatibility': binaryContext('--format keep-breaks --compatibility ie8 ./test/fixtures/unsupported/selectors-ie8.css', {
      'should not transform source': function (error, stdout) {
        assert.equal(stdout, fs.readFileSync('./test/fixtures/unsupported/selectors-ie8.css', 'utf-8').trim());
      }
    })
  })
  .addBatch({
    'custom compatibility': pipedContext('a{_color:red}', '--compatibility "+properties.iePrefixHack"', {
      'should not transform source': function (error, stdout) {
        assert.equal(stdout, 'a{_color:red}');
      }
    })
  })
  .addBatch({
    'custom compatibility non-boolean options': pipedContext('.block-1{color:red}.block-2{color:red}', '--compatibility "selectors.mergeLimit=1,unknown.option=all" -O2', {
      'keeps source intact': function (error, stdout) {
        assert.equal(stdout, '.block-1{color:red}.block-2{color:red}');
      }
    })
  })
  .addBatch({
    'rounding precision': {
      'default': pipedContext('div{width:0.10051px}', '', {
        'should keep 2 decimal places': function (error, stdout) {
          assert.equal(stdout, 'div{width:.10051px}');
        }
      }),
      'custom': pipedContext('div{width:0.00051px}', '-O1 roundingPrecision:4', {
        'should keep 4 decimal places': function (error, stdout) {
          assert.equal(stdout, 'div{width:.0005px}');
        }
      }),
      'zero': pipedContext('div{width:1.5051px}', '-O1 roundingPrecision:0', {
        'should keep 0 decimal places': function (error, stdout) {
          assert.equal(stdout, 'div{width:2px}');
        }
      }),
      'disabled': pipedContext('div{width:0.12345px}', '-O1 roundingPrecision:off', {
        'should keep all decimal places': function (error, stdout) {
          assert.equal(stdout, 'div{width:.12345px}');
        }
      }),
      'disabled via -1': pipedContext('div{width:0.12345px}', '-O1 roundingPrecision:\\\\-1', {
        'should keep all decimal places': function (error, stdout) {
          assert.equal(stdout, 'div{width:.12345px}');
        }
      }),
      'fine-grained': pipedContext('div{height:10.515rem;width:12.12345px}', '-O1 roundingPrecision:rem=2,px=1', {
        'should keep all decimal places': function (error, stdout) {
          assert.equal(stdout, 'div{height:10.52rem;width:12.1px}');
        }
      })
    }
  })
  .addBatch({
    'neighbour merging': {
      'of unmergeable properties': pipedContext('a{display:inline-block;color:red;display:-moz-block}', '-O2', {
        'gets right result': function (error, stdout) {
          assert.equal(stdout, 'a{display:inline-block;color:red;display:-moz-block}');
        }
      }),
      'of mergeable properties': pipedContext('a{background:red;display:block;background:white}', '-O2', {
        'gets right result': function (error, stdout) {
          assert.equal(stdout, 'a{background:#fff;display:block}');
        }
      })
    }
  })
  .addBatch({
    '@media merging': pipedContext('@media screen{a{color:red}}@media screen{a{display:block}}', '-O2 mergeMedia:off', {
      'gets right result': function (error, stdout) {
        assert.equal(stdout, '@media screen{a{color:red}}@media screen{a{display:block}}');
      }
    })
  })
  .addBatch({
    'shorthand merging': {
      'of mergeable properties with overriding off': pipedContext('a{background:url(image.png);background-color:red}', '-O2 overrideProperties:off', {
        'gets right result': function (error, stdout) {
          assert.equal(stdout, 'a{background:url(image.png);background-color:red}');
        }
      })
    }
  })
  .addBatch({
    'source maps - no target file': binaryContext('--source-map ./test/fixtures/reset.css', {
      'warns about source map not being build': function (error, stdout, stderr) {
        assert.include(stderr, 'Source maps will not be built because you have not specified an output file.');
      },
      'does not include map in stdout': function (error, stdout) {
        assert.notInclude(stdout, '/*# sourceMappingURL');
      }
    })
  })
  .addBatch({
    'source maps - output file': binaryContext('--source-map -o ./reset.min.css ./test/fixtures/reset.css', {
      'includes map in minified file': function () {
        assert.include(fs.readFileSync('./reset.min.css', 'utf-8'), lineBreak + '/*# sourceMappingURL=reset.min.css.map */');
      },
      'creates a map file': function () {
        assert.isTrue(fs.existsSync('./reset.min.css.map'));
      },
      'includes right content in map file': function () {
        var sourceMap = new SourceMapConsumer(fs.readFileSync('./reset.min.css.map', 'utf-8'));
        assert.deepEqual(
          sourceMap.originalPositionFor({ line: 1, column: 1 }),
          {
            source: 'test/fixtures/reset.css',
            line: 4,
            column: 0,
            name: null
          }
        );
      },
      'teardown': function () {
        deleteFile('reset.min.css');
        deleteFile('reset.min.css.map');
      }
    })
  })
  .addBatch({
    'source maps - output file in same folder as input': {
      topic: function () {
        var self = this;

        exec('cp test/fixtures/reset.css .', function () {
          exec('__DIRECT__=1 ./bin/cleancss --source-map -o ./reset.min.css ./reset.css', self.callback);
        });
      },
      'includes right content in map file': function () {
        var sourceMap = new SourceMapConsumer(fs.readFileSync('./reset.min.css.map', 'utf-8'));
        assert.deepEqual(
          sourceMap.originalPositionFor({ line: 1, column: 1 }),
          {
            source: 'reset.css',
            line: 4,
            column: 0,
            name: null
          }
        );
      },
      'teardown': function () {
        deleteFile('reset.css');
        deleteFile('reset.min.css');
        deleteFile('reset.min.css.map');
      }
    }
  })
  .addBatch({
    'source maps - output file with existing map': binaryContext('--source-map -o ./styles.min.css ./test/fixtures/source-maps/styles.css', {
      'includes right content in map file': function () {
        var sourceMap = new SourceMapConsumer(fs.readFileSync('./styles.min.css.map', 'utf-8'));
        assert.deepEqual(
          sourceMap.originalPositionFor({ line: 1, column: 1 }),
          {
            source: 'test/fixtures/source-maps/styles.less',
            line: 1,
            column: 4,
            name: null
          }
        );
      },
      'teardown': function () {
        deleteFile('styles.min.css');
        deleteFile('styles.min.css.map');
      }
    })
  })
  .addBatch({
    'source maps - output file for existing map in different folder': binaryContext('--source-map -o ./styles-relative.min.css ./test/fixtures/source-maps/relative.css', {
      'includes right content in map file': function () {
        var sourceMap = new SourceMapConsumer(fs.readFileSync('./styles-relative.min.css.map', 'utf-8'));
        assert.deepEqual(
          sourceMap.originalPositionFor({ line: 1, column: 1 }),
          {
            source: 'test/fixtures/source-maps/sub/styles.less',
            line: 2,
            column: 2,
            name: null
          }
        );
      },
      'teardown': function () {
        deleteFile('styles-relative.min.css');
        deleteFile('styles-relative.min.css.map');
      }
    })
  })
  .addBatch({
    'source maps - with input source map': binaryContext('--source-map -o ./import.min.css ./test/fixtures/source-maps/import.css', {
      'includes map in minified file': function () {
        assert.include(fs.readFileSync('./import.min.css', 'utf-8'), lineBreak + '/*# sourceMappingURL=import.min.css.map */');
      },
      'includes right content in map file': function () {
        var sourceMap = new SourceMapConsumer(fs.readFileSync('./import.min.css.map', 'utf-8'));
        var count = 0;
        sourceMap.eachMapping(function () { count++; });

        assert.equal(count, 6);
      },
      'teardown': function () {
        deleteFile('import.min.css');
        deleteFile('import.min.css.map');
      }
    })
  })
  .addBatch({
    'source maps - with input source map and source inlining': binaryContext('--source-map --source-map-inline-sources -o ./import-inline.min.css ./test/fixtures/source-maps/import.css', {
      'includes map in minified file': function () {
        assert.include(fs.readFileSync('./import-inline.min.css', 'utf-8'), lineBreak + '/*# sourceMappingURL=import-inline.min.css.map */');
      },
      'includes embedded sources': function () {
        var sourceMap = new SourceMapConsumer(fs.readFileSync('./import-inline.min.css.map', 'utf-8'));
        var count = 0;
        sourceMap.eachMapping(function () { count++; });

        assert.equal(count, 6);
      },
      'teardown': function () {
        deleteFile('import-inline.min.css');
        deleteFile('import-inline.min.css.map');
      }
    })
  })
  .addBatch({
    'semantic merging': {
      'disabled': pipedContext('.a{margin:0}.b{margin:10px;padding:0}.c{margin:0}', '', {
        'should output right data': function (error, stdout) {
          assert.equal(stdout, '.a{margin:0}.b{margin:10px;padding:0}.c{margin:0}');
        }
      }),
      'enabled': pipedContext('.a{margin:0}.b{margin:10px;padding:0}.c{margin:0}', '-O2 mergeSemantically:on', {
        'should output right data': function (error, stdout) {
          assert.equal(stdout, '.a,.c{margin:0}.b{margin:10px;padding:0}');
        }
      })
    }
  })
  .addBatch({
    'custom CLI': {
      'topic': function () {
        exec('echo ".block{background-image:url(image.png)}" | ./test/custom-cli/custom-cleancss', this.callback);
      },
      'outputs transformed url': function (error, stdout) {
        assert.equal(stdout, '.block{background-image:url(../valid/path/to/image.png)}');
      }
    }
  })
  .addBatch({
    'wildcard paths': {
      'files': binaryContext('./test/fixtures/partials/on*.css ./test/fixtures/partials/f?ve.css', {
        'outputs all matched sources minified': function (error, stdout) {
          assert.equal(stdout, '.one{color:red}.five{background:url(data:image/jpeg;base64,/9j/)}');
        }
      }),
      'directories': binaryContext('./test/fixtures/partials/**/*.css', {
        'outputs all matched sources minified': function (error, stdout) {
          assert.equal(stdout, '.one{color:red}.three{color:#0f0}.two{color:#fff}.four{color:#00f}');
        }
      })
    }
  })
  .addBatch({
    'removing inlined stylesheets - off': {
      'topic': function() {
        var self = this;

        exec('cp test/fixtures/reset.css test/fixtures/reset-removing.css', function () {
          exec('__DIRECT__=1 ./bin/cleancss test/fixtures/reset-removing.css', self.callback);
        });
      },
      'keeps the file': function () {
        assert.isTrue(fs.existsSync('test/fixtures/reset-removing.css'));
      },
      'teardown': function () {
        deleteFile('test/fixtures/reset-removing.css');
      }
    }
  })
  .addBatch({
    'removing inlined stylesheets - on': {
      'topic': function() {
        var self = this;

        exec('cp test/fixtures/reset.css test/fixtures/reset-removing.css', function () {
          exec('__DIRECT__=1 ./bin/cleancss --remove-inlined-files test/fixtures/reset-removing.css', self.callback);
        });
      },
      'removes the file': function () {
        assert.isFalse(fs.existsSync('test/fixtures/reset-removing.css'));
      }
    }
  })
  .addBatch({
    'removing inlined stylesheets - on via @import': {
      'topic': function() {
        var self = this;

        exec('cp test/fixtures/reset.css test/fixtures/reset-removing.css', function () {
          exec('echo "@import \'test/fixtures/reset-removing.css\';" | ./bin/cleancss --remove-inlined-files', self.callback);
        });
      },
      'removes the file': function () {
        assert.isFalse(fs.existsSync('test/fixtures/reset-removing.css'));
      }
    }
  })
  .addBatch({
    'process an input-source-map': pipedContext(fs.readFileSync('./test/fixtures/source-maps/map/styles.css'), '-o ./test/styles.min.css --input-source-map ./test/fixtures/source-maps/map/input.map', {
      'enables the source map flag': function() {
        assert.isTrue(fs.existsSync('test/styles.min.css'));
        assert.isTrue(fs.existsSync('test/styles.min.css.map'));
      },
      'teardown': function () {
        deleteFile('test/styles.min.css');
        deleteFile('test/styles.min.css.map');
      }
    })
  })
  .addBatch({
    'missing an input-source-map': pipedContext(fs.readFileSync('./test/fixtures/source-maps/map/styles.css'), '-o ./test/styles.min.css', {
      'does not generate a source map if the parameter is missing': function() {
        assert.isTrue(fs.existsSync('test/styles.min.css'));
        assert.isFalse(fs.existsSync('test/styles.min.css.map'));
      },
      'teardown': function () {
        deleteFile('test/styles.min.css');
      }
    })
  })
  .addBatch({
    'content of input-source-map': pipedContext(fs.readFileSync('./test/fixtures/source-maps/map/styles.css'), '-o ./test/styles.min.css --input-source-map ./test/fixtures/source-maps/map/input.map', {
      'includes the right content of the source map': function() {
        assert.isTrue(fs.existsSync('test/styles.min.css.map'));
        var sourceMap = new SourceMapConsumer(fs.readFileSync('./test/styles.min.css.map', 'utf-8'));

        assert.deepEqual(
          sourceMap.originalPositionFor({ line: 1, column: 1 }),
          {
            source: 'styles.less',
            line: 1,
            column: 4,
            name: null
          }
        );
      },
      'teardown': function () {
        deleteFile('test/styles.min.css');
        deleteFile('test/styles.min.css.map');
      }
    })
  })
  .export(module);
