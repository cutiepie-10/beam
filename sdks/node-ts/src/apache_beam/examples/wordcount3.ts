// TODO: Should this be in a top-level examples dir, rather than under apache_beam.

import * as beam from "../../apache_beam";
import * as external from "../../apache_beam/transforms/external";
import * as textio from "../io/textio";

import { DirectRunner } from "../runners/direct_runner";

import { CountFn } from "../transforms/combiners";
import { GroupBy } from "../transforms/group_and_combine";

import { PortableRunner } from "../runners/portable_runner/runner";

import * as internal from "../../apache_beam/transforms/internal";
import { RowCoder } from "../coders/row_coder";

class CountElements extends beam.PTransform<
  beam.PCollection<any>,
  beam.PCollection<any>
> {
  expand(input: beam.PCollection<any>) {
    return input
      .map((e) => ({ element: e }))
      .apply(
        new GroupBy("element").combining("element", new CountFn(), "count")
      );
  }
}

function wordCount(lines: beam.PCollection<string>): beam.PCollection<any> {
  return lines
    .map((s: string) => s.toLowerCase())
    .flatMap(function* (line: string) {
      yield* line.split(/[^a-z]+/);
    })
    .apply(new CountElements("Count"));
}

function sqlTransform(query, address) {
  return async (pcoll) => {
    return await pcoll.asyncApply(
      new external.RawExternalTransform(
        "beam:external:java:sql:v1",
        { query: query },
        address
      )
    );
  };
}

async function main() {
  // python apache_beam/runners/portability/local_job_service_main.py --port 3333
  await new PortableRunner("localhost:3333").run(async (root) => {
    const lines = root.apply(new beam.Create(["a", "b", "c", "c"]));

    const filtered = await lines
      .map((w) => ({ word: w }))
      .apply(new internal.WithCoderInternal(RowCoder.OfJSON({ word: "str" })))
      .asyncApply(
        // java -jar sdks/java/extensions/sql/expansion-service/build/libs/beam-sdks-java-extensions-sql-expansion-service-2.37.0-SNAPSHOT.j 9999
        sqlTransform(
          "SELECT word, count(*) as c from PCOLLECTION group by word",
          "localhost:9999"
        )
      );

    filtered.map(console.log);
  });
}

main()
  .catch((e) => console.error(e))
  .finally(() => process.exit());
