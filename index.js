var fs = require('fs');
var path = require('path');

var CleanCSS = require('clean-css');
var commands = require('commander');
var glob = require('glob');

var COMPATIBILITY_PATTERN = /([\w\.]+)=(\w+)/g;
var lineBreak = require('os').EOL;

function cli(process, beforeMinifyCallback) {
  var packageConfig = fs.readFileSync(path.join(__dirname, 'package.json'));
  var buildVersion = JSON.parse(packageConfig).version;
  var fromStdin;
  var debugMode;
  var removeInlinedFiles;
  var options;
  var stdin;
  var data;

  beforeMinifyCallback = beforeMinifyCallback || Function.prototype;

  // Specify commander options to parse command line params correctly
  commands
    .version(buildVersion, '-v, --version')
    .usage('[options] <source-file ...>')
    .option('-c, --compatibility [ie7|ie8]', 'Force compatibility mode (see Readme for advanced examples)')
    .option('-d, --debug', 'Shows debug information (minification time & compression efficiency)')
    .option('-f, --format <options>', 'Controls output formatting, see examples below')
    .option('-o, --output [output-file]', 'Use [output-file] as output instead of STDOUT')
    .option('-O <n> [optimizations]', 'Turn on level <n> optimizations; optionally accepts a list of fine-grained options, defaults to `1`, see examples below', function (val) { return Math.abs(parseInt(val)); })
    .option('--inline [rules]', 'Enables inlining for listed sources (defaults to `local`)')
    .option('--inline-timeout [seconds]', 'Per connection timeout when fetching remote stylesheets (defaults to 5 seconds)', parseFloat)
    .option('--remove-inlined-files', 'Remove files inlined in <source-file ...> or via `@import` statements')
    .option('--skip-rebase', 'Disable URLs rebasing')
    .option('--source-map', 'Enables building input\'s source map')
    .option('--source-map-inline-sources', 'Enables inlining sources inside source maps');

  commands.on('--help', function () {
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
    console.log('    %> # `breaks` controls where to insert breaks');
    console.log('    %> #   `afterAtRule` controls if a line break comes after an at-rule; e.g. `@charset`; defaults to `off` (alias to `false`)');
    console.log('    %> #   `afterBlockBegins` controls if a line break comes after a block begins; e.g. `@media`; defaults to `off`');
    console.log('    %> #   `afterBlockEnds` controls if a line break comes after a block ends, defaults to `off`');
    console.log('    %> #   `afterComment` controls if a line break comes after a comment; defaults to `off`');
    console.log('    %> #   `afterProperty` controls if a line break comes after a property; defaults to `off`');
    console.log('    %> #   `afterRuleBegins` controls if a line break comes after a rule begins; defaults to `off`');
    console.log('    %> #   `afterRuleEnds` controls if a line break comes after a rule ends; defaults to `off`');
    console.log('    %> #   `beforeBlockEnds` controls if a line break comes before a block ends; defaults to `off`');
    console.log('    %> #   `betweenSelectors` controls if a line break comes between selectors; defaults to `off`');
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

  commands.parse(process.argv);

  if (commands.rawArgs.indexOf('-O0') > -1) {
    commands.O0 = true;
  }

  if (commands.rawArgs.indexOf('-O1') > -1) {
    commands.O1 = findArgumentTo('-O1', commands.rawArgs, commands.args);
  }

  if (commands.rawArgs.indexOf('-O2') > -1) {
    commands.O2 = findArgumentTo('-O2', commands.rawArgs, commands.args);
  }

  // If no sensible data passed in just print help and exit
  if (commands.args.length === 0) {
    fromStdin = !process.env.__DIRECT__ && !process.stdin.isTTY;
    if (!fromStdin) {
      commands.outputHelp();
      return 0;
    }
  }

  // Now coerce commands into CleanCSS configuration...
  debugMode = commands.debug;
  removeInlinedFiles = commands.removeInlinedFiles;

  options = {
    compatibility: commands.compatibility,
    format: commands.format,
    inline: typeof commands.inline == 'string' ? commands.inline : 'local',
    inlineTimeout: commands.inlineTimeout * 1000,
    level: commands.O0 || commands.O1 || commands.O2 ?
      { '0': commands.O0, '1': commands.O1, '2': commands.O2 } :
      undefined,
    output: commands.output,
    rebase: commands.skipRebase ? false : true,
    rebaseTo: ('output' in commands) && commands.output.length > 0 ? path.dirname(path.resolve(commands.output)) : process.cwd(),
    sourceMap: commands.sourceMap,
    sourceMapInlineSources: commands.sourceMapInlineSources
  };

  if (options.sourceMap && !options.output) {
    outputFeedback(['Source maps will not be built because you have not specified an output file.'], true);
    options.sourceMap = false;
  }

  // ... and do the magic!
  if (commands.args.length > 0) {
    minify(process, beforeMinifyCallback, options, debugMode, removeInlinedFiles, expandGlobs(commands.args));
  } else {
    stdin = process.openStdin();
    stdin.setEncoding('utf-8');
    data = '';
    stdin.on('data', function (chunk) {
      data += chunk;
    });
    stdin.on('end', function () {
      minify(process, beforeMinifyCallback, options, debugMode, removeInlinedFiles, data);
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

function minify(process, beforeMinifyCallback, options, debugMode, removeInlinedFiles, data) {
  var cleanCss = new CleanCSS(options);

  applyNonBooleanCompatibilityFlags(cleanCss, options.compatibility);
  beforeMinifyCallback(cleanCss);
  cleanCss.minify(data, function (errors, minified) {
    var mapFilename;

    if (debugMode) {
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
    }

    outputFeedback(minified.errors, true);
    outputFeedback(minified.warnings);

    if (minified.errors.length > 0) {
      process.exit(1);
    }

    if (removeInlinedFiles) {
      minified.inlinedStylesheets.forEach(fs.unlinkSync);
    }

    if (minified.sourceMap) {
      mapFilename = path.basename(options.output) + '.map';
      output(process, options, minified.styles + lineBreak + '/*# sourceMappingURL=' + mapFilename + ' */');
      outputMap(options, minified.sourceMap, mapFilename);
    } else {
      output(process, options, minified.styles);
    }
  });
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

function output(process, options, minified) {
  if (options.output) {
    fs.writeFileSync(options.output, minified, 'utf8');
  } else {
    process.stdout.write(minified);
  }
}

function outputMap(options, sourceMap, mapFilename) {
  var mapPath = path.join(path.dirname(options.output), mapFilename);
  fs.writeFileSync(mapPath, sourceMap.toString(), 'utf-8');
}

module.exports = cli;
