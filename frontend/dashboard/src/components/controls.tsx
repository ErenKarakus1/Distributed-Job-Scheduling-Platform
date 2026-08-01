import type { PageState } from "../types.js";

export function Pager(props: {
  page: PageState;
  onChange: (page: PageState) => void;
  onApply: (page: PageState) => void;
}) {
  const currentEnd = Math.min(props.page.offset + props.page.limit, props.page.total);
  const canGoBack = props.page.offset > 0;
  const canGoNext = props.page.offset + props.page.limit < props.page.total;

  return (
    <section className="pager">
      <span>
        {props.page.total === 0 ? "0" : props.page.offset + 1}-{currentEnd} of {props.page.total}
      </span>
      <button
        disabled={!canGoBack}
        onClick={() => {
          const nextPage = { ...props.page, offset: Math.max(props.page.offset - props.page.limit, 0) };
          props.onChange(nextPage);
          props.onApply(nextPage);
        }}
      >
        Prev
      </button>
      <button
        disabled={!canGoNext}
        onClick={() => {
          const nextPage = { ...props.page, offset: props.page.offset + props.page.limit };
          props.onChange(nextPage);
          props.onApply(nextPage);
        }}
      >
        Next
      </button>
    </section>
  );
}

export function FilterBar(props: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  onApply: () => void;
}) {
  return (
    <section className="filter-bar">
      <label>
        {props.label}
        <select value={props.value} onChange={(event) => props.onChange(event.target.value)}>
          <option value="">All</option>
          {props.options.map((option) => (
            <option value={option} key={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
      <button onClick={props.onApply}>Apply</button>
    </section>
  );
}
