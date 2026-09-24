import { build } from './build-data.mjs';
const stage=process.argv[2];
if(stage==='content') console.log('build:content — scaffold no-op');
else if(stage==='data') {
 const report=await build({input:'data-src/WPP2024_Demographic_Indicators_Medium.csv.gz',out:'public/data',revision:'2024',expectedPlaces:273,expectedSourceHash:'286ac36bb1415e2e1ade03acfef0a29f0e4c087e2f78e38c48f50c5df89082bc'});
 console.log(`build:data — generated ${report.places} places (${report.sourceHash})`);
} else throw Error(`Unknown build stage: ${stage}`);
