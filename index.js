var fs = require('fs');
var path = require('path');

var CleanCSS = require('clean-css');
var program = require('commander');
var glob = require('glob');

var COMPATIBILITY_PATTERN = /([\w\.]+)=(\w+)/g;
var lineBreak = require('os').EOL;

function cli(process, beforeMinifyCallback) {
  var packageConfig = fs.readFileSync(path.join(__dirname, 'package.json'));
  var buildVersion = JSON.parse(packageConfig).version;
  var fromStdin;
  var debugMode;
  var removeInlinedFiles;
  var inputOptions;
  var options;
  var stdin;
  var data;

  beforeMinifyCallback = beforeMinifyCallback || Function.prototype;

  // Specify commander options to parse command line params correctly
  program
    .version(buildVersion, '-v, --version')
    .usage('[options] <source-file ...>')
    .option('-b, --batch', 'If enabled, optimizes input files one by one instead of joining them together')
    .option('-c, --compatibility [ie7|ie8]', 'Force compatibility mode (see Readme for advanced examples)')
    .option('-d, --debug', 'Shows debug information (minification time & compression efficiency)')
    .option('-f, --format <options>', 'Controls output formatting, see examples below')
    .option('-o, --output [output-file]', 'Use [output-file] as output instead of STDOUT')
    .option('-O <n> [optimizations]', 'Turn on level <n> optimizations; optionally accepts a list of fine-grained options, defaults to `1`, see examples below, IMPORTANT: the prefix is O (a capital o letter), NOT a 0 (zero, a number)', function (val) { return Math.abs(parseInt(val)); })
    .option('--batch-suffix <suffix>', 'A suffix (without extension) appended to input file name when processing in batch mode (`-min` is the default)', '-min')
    .option('--inline [rules]', 'Enables inlining for listed sources (defaults to `local`)')
    .option('--inline-timeout [seconds]', 'Per connection timeout when fetching remote stylesheets (defaults to 5 seconds)', parseFloat)
    .option('--remove-inlined-files', 'Remove files inlined in <source-file ...> or via `@import` statements')
    .option('--with-rebase', 'Enable URLs rebasing')
    .option('--source-map', 'Enables building input\'s source map')
    .option('--source-map-inline-sources', 'Enables inlining sources inside source maps')
    .option('--input-source-map [file]', 'Specifies the path of the input source map file');

  program.on('--help', function () {
    console.log('  Examples:\n');
    console.log('    %> cleancss one.css');
    console.log('    %> cleancss -o one-min.css one.css');
    console.log('    %> cleancss -o merged-and-minified.css one.css two.css three.css');
    console.log('    %> cleancss one.css two.css three.css | gzip -9 -c > merged-minified-and-gzipped.css.gz');
    console.log('');
    console.log('  Formatting options:');
    console.log('    %> cleancss --format beautify one.css');
    console.log('    %> cleancss --format keep-breaks one.css');
    console.log('    %> cleancss --format \'indentBy:1;indentWith:tab\' one.css');
    console.log('    %> cleancss --format \'breaks:afterBlockBegins=on;spaces:aroundSelectorRelation=on\' one.css');
    console.log('    %> cleancss --format \'breaks:afterBlockBegins=2;spaces:aroundSelectorRelation=on\' one.css');
    console.log('    %> # `breaks` controls where to insert breaks');
    console.log('    %> #   `afterAtRule` controls if a line break comes after an at-rule; e.g. `@charset`; defaults to `off` (alias to `false`); accepts number of line breaks as an argument too');
    console.log('    %> #   `afterBlockBegins` controls if a line break comes after a block begins; e.g. `@media`; defaults to `off`; accepts number of line breaks as an argument too');
    console.log('    %> #   `afterBlockEnds` controls if a line break comes after a block ends, defaults to `off`; accepts number of line breaks as an argument too');
    console.log('    %> #   `afterComment` controls if a line break comes after a comment; defaults to `off`; accepts number of line breaks as an argument too');
    console.log('    %> #   `afterProperty` controls if a line break comes after a property; defaults to `off`; accepts number of line breaks as an argument too');
    console.log('    %> #   `afterRuleBegins` controls if a line break comes after a rule begins; defaults to `off`; accepts number of line breaks as an argument too');
    console.log('    %> #   `afterRuleEnds` controls if a line break comes after a rule ends; defaults to `off`; accepts number of line breaks as an argument too');
    console.log('    %> #   `beforeBlockEnds` controls if a line break comes before a block ends; defaults to `off`; accepts number of line breaks as an argument too');
    console.log('    %> #   `betweenSelectors` controls if a line break comes between selectors; defaults to `off`; accepts number of line breaks as an argument too');
    console.log('    %> # `indentBy` controls number of characters to indent with; defaults to `0`');
    console.log('    %> # `indentWith` controls a character to indent with, can be `space` or `tab`; defaults to `space`');
    console.log('    %> # `spaces` controls where to insert spaces');
    console.log('    %> #   `aroundSelectorRelation` controls if spaces come around selector relations; e.g. `div > a`; defaults to `off`');
    console.log('    %> #   `beforeBlockBegins` controls if a space comes before a block begins; e.g. `.block {`; defaults to `off`');
    console.log('    %> #   `beforeValue` controls if a space comes before a value; e.g. `width: 1rem`; defaults to `off`');
    console.log('    %> # `wrapAt` controls maximum line length; defaults to `off`');
    console.log('');
    console.log('  Level 0 optimizations:');
    console.log('    %> cleancss -O0 one.css');
    console.log('');
    console.log('  Level 1 optimizations:');
    console.log('    %> cleancss -O1 one.css');
    console.log('    %> cleancss -O1 removeQuotes:off;roundingPrecision:4;specialComments:1 one.css');
    console.log('    %> cleancss -O1 all:off;specialComments:1 one.css');
    console.log('    %> # `cleanupCharsets` controls `@charset` moving to the front of a stylesheet; defaults to `on`');
    console.log('    %> # `normalizeUrls` controls URL normalzation; default to `on`');
    console.log('    %> # `optimizeBackground` controls `background` property optimizatons; defaults to `on`');
    console.log('    %> # `optimizeBorderRadius` controls `border-radius` property optimizatons; defaults to `on`');
    console.log('    %> # `optimizeFilter` controls `filter` property optimizatons; defaults to `on`');
    console.log('    %> # `optimizeFontWeight` controls `font-weight` property optimizatons; defaults to `on`');
    console.log('    %> # `optimizeOutline` controls `outline` property optimizatons; defaults to `on`');
    console.log('    %> # `removeEmpty` controls removing empty rules and nested blocks; defaults to `on` (since 4.1.0)');
    console.log('    %> # `removeNegativePaddings` controls removing negative paddings; defaults to `on`');
    console.log('    %> # `removeQuotes` controls removing quotes when unnecessary; defaults to `on`');
    console.log('    %> # `removeWhitespace` controls removing unused whitespace; defaults to `on`');
    console.log('    %> # `replaceMultipleZeros` contols removing redundant zeros; defaults to `on`');
    console.log('    %> # `replaceTimeUnits` controls replacing time units with shorter values; defaults to `on');
    console.log('    %> # `replaceZeroUnits` controls replacing zero values with units; defaults to `on`');
    console.log('    %> # `roundingPrecision` rounds pixel values to `N` decimal places; `off` disables rounding; defaults to `off`');
    console.log('    %> # `selectorsSortingMethod` denotes selector sorting method; can be `natural` or `standard`; defaults to `standard`');
    console.log('    %> # `specialComments` denotes a number of /*! ... */ comments preserved; defaults to `all`');
    console.log('    %> # `tidyAtRules` controls at-rules (e.g. `@charset`, `@import`) optimizing; defaults to `on`');
    console.log('    %> # `tidyBlockScopes` controls block scopes (e.g. `@media`) optimizing; defaults to `on`');
    console.log('    %> # `tidySelectors` controls selectors optimizing; defaults to `on`');
    console.log('');
    console.log('  Level 2 optimizations:');
    console.log('    %> cleancss -O2 one.css');
    console.log('    %> cleancss -O2 mergeMedia:off;restructureRules:off;mergeSemantically:on;mergeIntoShorthands:off one.css');
    console.log('    %> cleancss -O2 all:off;removeDuplicateRules:on one.css');
    console.log('    %> # `mergeAdjacentRules` controls adjacent rules merging; defaults to `on`');
    console.log('    %> # `mergeIntoShorthands` controls merging properties into shorthands; defaults to `on`');
    console.log('    %> # `mergeMedia` controls `@media` merging; defaults to `on`');
    console.log('    %> # `mergeNonAdjacentRules` controls non-adjacent rule merging; defaults to `on`');
    console.log('    %> # `mergeSemantically` controls semantic merging; defaults to `off`');
    console.log('    %> # `overrideProperties` controls property overriding based on understandability; defaults to `on`');
    console.log('    %> # `reduceNonAdjacentRules` controls non-adjacent rule reducing; defaults to `on`');
    console.log('    %> # `removeDuplicateFontRules` controls duplicate `@font-face` removing; defaults to `on`');
    console.log('    %> # `removeDuplicateMediaBlocks` controls duplicate `@media` removing; defaults to `on`');
    console.log('    %> # `removeDuplicateRules` controls duplicate rules removing; defaults to `on`');
    console.log('    %> # `removeEmpty` controls removing empty rules and nested blocks; defaults to `on` (since 4.1.0)');
    console.log('    %> # `removeUnusedAtRules` controls unused at rule removing; defaults to `off` (since 4.1.0)');
    console.log('    %> # `restructureRules` controls rule restructuring; defaults to `off`');
    console.log('    %> # `skipProperties` controls which properties won\'t be optimized, defaults to empty list which means all will be optimized (since 4.1.0)');

    process.exit();
  });

  program.parse(process.argv);
  inputOptions = program.opts();

  // If no sensible data passed in just print help and exit
  if (program.args.length === 0) {
    fromStdin = !process.env.__DIRECT__ && !process.stdin.isTTY;
    if (!fromStdin) {
      program.outputHelp();
      return 0;
    }
  }

  // Now coerce arguments into CleanCSS configuration...
  debugMode = inputOptions.debug;
  removeInlinedFiles = inputOptions.removeInlinedFiles;

  options = {
    batch: inputOptions.batch,
    compatibility: inputOptions.compatibility,
    format: inputOptions.format,
    inline: typeof inputOptions.inline == 'string' ? inputOptions.inline : 'local',
    inlineTimeout: inputOptions.inlineTimeout * 1000,
    level: { 1: true },
    output: inputOptions.output,
    rebase: inputOptions.withRebase ? true : false,
    rebaseTo: ('output' in inputOptions) && inputOptions.output.length > 0 ? path.dirname(path.resolve(inputOptions.output)) : (inputOptions.withRebase ? process.cwd() : undefined),
    sourceMap: inputOptions.sourceMap,
    sourceMapInlineSources: inputOptions.sourceMapInlineSources
  };

  if (program.rawArgs.indexOf('-O0') > -1) {
    options.level[0] = true;
  }

  if (program.rawArgs.indexOf('-O1') > -1) {
    options.level[1] = findArgumentTo('-O1', program.rawArgs, program.args);
  }

  if (program.rawArgs.indexOf('-O2') > -1) {
    options.level[2] = findArgumentTo('-O2', program.rawArgs, program.args);
  }

  if (inputOptions.inputSourceMap && !options.sourceMap) {
    options.sourceMap = true;
  }

  if (options.sourceMap && !options.output) {
    outputFeedback(['Source maps will not be built because you have not specified an output file.'], true);
    options.sourceMap = false;
  }

  var configurations = {
    batchSuffix: inputOptions.batchSuffix,
    beforeMinifyCallback: beforeMinifyCallback,
    debugMode: debugMode,
    removeInlinedFiles: removeInlinedFiles,
    inputSourceMap: inputOptions.inputSourceMap
  };

  // ... and do the magic!
  if (program.args.length > 0) {
    minify(process, options, configurations, expandGlobs(program.args));
  } else {
    stdin = process.openStdin();
    stdin.setEncoding('utf-8');
    data = '';
    stdin.on('data', function (chunk) {
      data += chunk;
    });
    stdin.on('end', function () {
      minify(process, options, configurations, data);
    });
  }
}

function findArgumentTo(option, rawArgs, args) {
  var value = true;
  var optionAt = rawArgs.indexOf(option);
  var nextOption = rawArgs[optionAt + 1];
  var looksLikePath;
  var asArgumentAt;

  if (!nextOption) {
    return value;
  }

  looksLikePath = nextOption.indexOf('.css') > -1 ||
    /\//.test(nextOption) ||
    /\\[^\-]/.test(nextOption) ||
    /^https?:\/\//.test(nextOption);
  asArgumentAt = args.indexOf(nextOption);

  if (!looksLikePath) {
    value = nextOption;
  }

  if (!looksLikePath && asArgumentAt > -1) {
    args.splice(asArgumentAt, 1);
  }

  return value;
}

function expandGlobs(paths) {
  return paths.reduce(function (accumulator, path) {
    return accumulator.concat(glob.sync(path, { nodir: true, nonull: true}));
  }, []);
}

function minify(process, options, configurations, data) {
  var cleanCss = new CleanCSS(options);

  applyNonBooleanCompatibilityFlags(cleanCss, options.compatibility);
  configurations.beforeMinifyCallback(cleanCss);
  cleanCss.minify(data, getSourceMapContent(configurations.inputSourceMap), function (errors, minified) {
    var inputPath;

    if (options.batch && !('styles' in minified)) {
      for (inputPath in minified) {
        processMinified(process, configurations, minified[inputPath], inputPath, toOutputPath(inputPath, configurations.batchSuffix));
      }
    } else {
      processMinified(process, configurations, minified, null, options.output);
    }
  });
}

function toOutputPath(inputPath, batchSuffix) {
  var extensionName = path.extname(inputPath);

  return inputPath.replace(new RegExp(extensionName + '$'), batchSuffix + extensionName);
}

function processMinified(process, configurations, minified, inputPath, outputPath) {
  var mapOutputPath;

  if (configurations.debugMode) {
    if (inputPath) {
      console.error('File: %s', inputPath);
    }

    console.error('Original: %d bytes', minified.stats.originalSize);
    console.error('Minified: %d bytes', minified.stats.minifiedSize);
    console.error('Efficiency: %d%', ~~(minified.stats.efficiency * 10000) / 100.0);
    console.error('Time spent: %dms', minified.stats.timeSpent);

    if (minified.inlinedStylesheets.length > 0) {
      console.error('Inlined stylesheets:');
      minified.inlinedStylesheets.forEach(function (uri) {
        console.error('- %s', uri);
      });
    }

    console.error('');
  }

  outputFeedback(minified.errors, true);
  outputFeedback(minified.warnings);

  if (minified.errors.length > 0) {
    process.exit(1);
  }

  if (configurations.removeInlinedFiles) {
    minified.inlinedStylesheets.forEach(fs.unlinkSync);
  }

  if (minified.sourceMap) {
    mapOutputPath = outputPath + '.map';
    output(process, outputPath, minified.styles + lineBreak + '/*# sourceMappingURL=' + path.basename(mapOutputPath) + ' */');
    outputMap(mapOutputPath, minified.sourceMap);
  } else {
    output(process, outputPath, minified.styles);
  }
}

function applyNonBooleanCompatibilityFlags(cleanCss, compatibility) {
  var match;
  var scope;
  var parts;
  var i, l;

  if (!compatibility) {
    return;
  }

  patternLoop:
  while ((match = COMPATIBILITY_PATTERN.exec(compatibility)) !== null) {
    scope = cleanCss.options.compatibility;
    parts = match[1].split('.');

    for (i = 0, l = parts.length - 1; i < l; i++) {
      scope = scope[parts[i]];

      if (!scope) {
        continue patternLoop;
      }
    }

    scope[parts.pop()] = match[2];
  }
}

function outputFeedback(messages, isError) {
  var prefix = isError ? '\x1B[31mERROR\x1B[39m:' : 'WARNING:';

  messages.forEach(function (message) {
    console.error('%s %s', prefix, message);
  });
}

function getSourceMapContent(sourceMapPath) {
  if (!sourceMapPath || !fs.existsSync(sourceMapPath)) {
    return null;
  }
  var content = null;

  try {
    content = fs.readFileSync(sourceMapPath).toString();
  } catch (e) {
    console.error('Failed to read the input source map file.');
  }

  return content;
}

function output(process, outputPath, minified) {
  if (outputPath) {
    fs.writeFileSync(outputPath, minified, 'utf8');
  } else {
    process.stdout.write(minified);
  }
}

function outputMap(mapOutputPath, sourceMap) {
  fs.writeFileSync(mapOutputPath, sourceMap.toString(), 'utf-8');
}

module.exports = cli;
