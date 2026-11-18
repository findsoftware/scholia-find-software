// Interactive graph of the Wikidata entities connected to an algorithm or
// a piece of software. Used on the software index page.
//
// Click a node to expand its neighbourhood, double-click to open its
// Scholia page.

var SOFTWARE_GRAPH_PROPERTIES = {
    P2283: "uses",
    P1535: "used by",
    P144: "based on",
    P366: "has use",
    P361: "part of",
    P527: "has part(s)",
    P1269: "facet of",
    P279: "subclass of",
    P31: "instance of",
    P1343: "described by source",
    P921: "main subject",
    P4510: "describes a project that uses",
    P2860: "cites work"
};

var SOFTWARE_GRAPH_COLORS = {
    algorithm: "#d95f02",
    software: "#1b9e77",
    work: "#7570b3",
    other: "#999999"
};


function softwareGraphEdgesQuery(q) {
    var entity = "wd:" + q;
    return `PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT ?source ?property ?target ?sourceLabel ?targetLabel WHERE {
  {
    SELECT ?source ?property ?target WHERE {
      VALUES ?property { wdt:P2283 wdt:P1535 wdt:P144 wdt:P366 wdt:P361 wdt:P527 wdt:P1269 wdt:P279 wdt:P31 wdt:P1343 }
      ${entity} ?property ?target .
      FILTER(isIRI(?target))
      BIND(${entity} AS ?source)
    } LIMIT 60
  }
  UNION
  {
    SELECT ?source ?property ?target WHERE {
      VALUES ?property { wdt:P2283 wdt:P1535 wdt:P144 wdt:P366 wdt:P361 wdt:P527 wdt:P1269 wdt:P279 }
      ?source ?property ${entity} .
      BIND(${entity} AS ?target)
    } LIMIT 60
  }
  UNION
  {
    SELECT ?source ?property ?target WHERE {
      VALUES ?property { wdt:P921 wdt:P4510 wdt:P2860 }
      ?source ?property ${entity} .
      BIND(${entity} AS ?target)
    } LIMIT 25
  }
  OPTIONAL { ?source rdfs:label ?sourceLabel . FILTER(LANG(?sourceLabel) = "en") }
  OPTIONAL { ?target rdfs:label ?targetLabel . FILTER(LANG(?targetLabel) = "en") }
}`;
}


function softwareGraphKindsQuery(qs) {
    var values = qs.map(function (q) { return "wd:" + q; }).join(" ");
    return `PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
SELECT ?item ?kind WHERE {
  VALUES ?item { ${values} }
  { ?item wdt:P31 wd:Q13442814 . BIND("work" AS ?kind) }
  UNION { ?item wdt:P31/wdt:P279* wd:Q8366 . BIND("algorithm" AS ?kind) }
  UNION { ?item wdt:P31/wdt:P279* wd:Q7397 . BIND("software" AS ?kind) }
}`;
}


function softwareGraphQuery(endpointUrl, sparql) {
    return $.ajax(endpointUrl, {
        headers: { Accept: "application/sparql-results+json" },
        data: { query: sparql }
    });
}


function entityToQ(uri) {
    return uri.slice(uri.lastIndexOf("/") + 1);
}


function SoftwareGraph(endpointUrl, element, statusElement) {
    this.endpointUrl = endpointUrl;
    this.element = element;
    this.statusElement = statusElement;
    this.width = $(element).width() || 900;
    this.height = 560;
    this.reset();
}


SoftwareGraph.prototype.reset = function () {
    this.nodes = [];
    this.links = [];
    this.nodeById = {};
    this.linkIds = {};
    this.expanded = {};

    d3.select(this.element).selectAll("*").remove();
    var svg = d3.select(this.element).append("svg")
        .attr("width", "100%")
        .attr("height", this.height)
        .attr("viewBox", [0, 0, this.width, this.height].join(" "));

    svg.append("defs").append("marker")
        .attr("id", "software-graph-arrow")
        .attr("viewBox", "0 -5 10 10")
        .attr("refX", 18)
        .attr("refY", 0)
        .attr("markerWidth", 6)
        .attr("markerHeight", 6)
        .attr("orient", "auto")
        .append("path")
        .attr("d", "M0,-5L10,0L0,5")
        .attr("fill", "#999");

    var container = svg.append("g");
    svg.call(d3.zoom().scaleExtent([0.2, 4]).on("zoom", function () {
        container.attr("transform", d3.event.transform);
    }));

    this.linkGroup = container.append("g");
    this.nodeGroup = container.append("g");

    this.simulation = d3.forceSimulation()
        .force("link", d3.forceLink().id(function (d) { return d.id; }).distance(110))
        .force("charge", d3.forceManyBody().strength(-260))
        .force("center", d3.forceCenter(this.width / 2, this.height / 2))
        .force("collide", d3.forceCollide(22));
};


SoftwareGraph.prototype.status = function (text) {
    $(this.statusElement).text(text);
};


SoftwareGraph.prototype.show = function (q) {
    this.reset();
    this.expand(q, true);
};


SoftwareGraph.prototype.addNode = function (q, label) {
    var node = this.nodeById[q];
    if (!node) {
        node = { id: q, label: label || q, kind: "other",
                 x: this.width / 2 + Math.random() * 40 - 20,
                 y: this.height / 2 + Math.random() * 40 - 20 };
        this.nodeById[q] = node;
        this.nodes.push(node);
    } else if (label && node.label === q) {
        node.label = label;
    }
    return node;
};


SoftwareGraph.prototype.expand = function (q, isRoot) {
    var self = this;
    if (self.expanded[q]) {
        return;
    }
    self.expanded[q] = true;
    self.status("Loading connections of " + q + " ...");

    softwareGraphQuery(self.endpointUrl, softwareGraphEdgesQuery(q))
        .then(function (response) {
            var newQs = [];
            var root = self.addNode(q);
            if (isRoot) {
                root.root = true;
            }
            response.results.bindings.forEach(function (row) {
                var source = entityToQ(row.source.value);
                var target = entityToQ(row.target.value);
                if (!/^Q\d+$/.test(source) || !/^Q\d+$/.test(target)) {
                    return;
                }
                [[source, row.sourceLabel], [target, row.targetLabel]].forEach(function (pair) {
                    if (!self.nodeById[pair[0]]) {
                        newQs.push(pair[0]);
                    }
                    self.addNode(pair[0], pair[1] && pair[1].value);
                });
                var property = entityToQ(row.property.value);
                var linkId = source + "-" + property + "-" + target;
                if (!self.linkIds[linkId]) {
                    self.linkIds[linkId] = true;
                    self.links.push({ source: source, target: target, property: property });
                }
            });
            if (newQs.indexOf(q) === -1 && root.kind === "other") {
                newQs.push(q);
            }
            if (response.results.bindings.length === 0) {
                self.status("No connected entities found for " + q + ".");
            } else {
                self.status(self.nodes.length + " entities, " + self.links.length +
                            " connections. Click a node to expand it, double-click to open it.");
            }
            self.render();
            return newQs.length ? softwareGraphQuery(
                self.endpointUrl, softwareGraphKindsQuery(newQs)) : null;
        })
        .then(function (response) {
            if (!response) {
                return;
            }
            var priority = { work: 3, algorithm: 2, software: 1, other: 0 };
            response.results.bindings.forEach(function (row) {
                var node = self.nodeById[entityToQ(row.item.value)];
                if (node && priority[row.kind.value] > priority[node.kind]) {
                    node.kind = row.kind.value;
                }
            });
            self.render();
        })
        .fail(function () {
            self.expanded[q] = false;
            self.status("Could not load the connections of " + q + ".");
        });
};


SoftwareGraph.prototype.render = function () {
    var self = this;

    var link = self.linkGroup.selectAll("g.link")
        .data(self.links, function (d) {
            return (d.source.id || d.source) + "-" + d.property + "-" + (d.target.id || d.target);
        });
    var linkEnter = link.enter().append("g").attr("class", "link");
    linkEnter.append("line")
        .attr("stroke", "#999")
        .attr("stroke-opacity", 0.7)
        .attr("marker-end", "url(#software-graph-arrow)");
    linkEnter.append("text")
        .attr("font-size", 9)
        .attr("fill", "#777")
        .attr("text-anchor", "middle")
        .text(function (d) { return SOFTWARE_GRAPH_PROPERTIES[d.property] || d.property; });
    link = linkEnter.merge(link);

    var node = self.nodeGroup.selectAll("g.node")
        .data(self.nodes, function (d) { return d.id; });
    var nodeEnter = node.enter().append("g")
        .attr("class", "node")
        .style("cursor", "pointer")
        .on("click", function (d) { self.expand(d.id, false); })
        .on("dblclick", function (d) { window.location.href = "/" + d.id; })
        .call(d3.drag()
            .on("start", function (d) {
                if (!d3.event.active) self.simulation.alphaTarget(0.3).restart();
                d.fx = d.x;
                d.fy = d.y;
            })
            .on("drag", function (d) {
                d.fx = d3.event.x;
                d.fy = d3.event.y;
            })
            .on("end", function (d) {
                if (!d3.event.active) self.simulation.alphaTarget(0);
                d.fx = null;
                d.fy = null;
            }));
    nodeEnter.append("circle")
        .attr("stroke", "#fff")
        .attr("stroke-width", 1.5);
    nodeEnter.append("text")
        .attr("x", 12)
        .attr("y", 4)
        .attr("font-size", 11);
    nodeEnter.append("title");
    node = nodeEnter.merge(node);

    node.select("circle")
        .attr("r", function (d) { return d.root ? 12 : 8; })
        .attr("fill", function (d) { return SOFTWARE_GRAPH_COLORS[d.kind]; });
    node.select("text")
        .attr("font-weight", function (d) { return d.root ? "bold" : "normal"; })
        .text(function (d) {
            return d.label.length > 40 ? d.label.slice(0, 37) + "..." : d.label;
        });
    node.select("title")
        .text(function (d) { return d.label + " (" + d.id + ", " + d.kind + ")"; });

    self.simulation.nodes(self.nodes).on("tick", function () {
        link.select("line")
            .attr("x1", function (d) { return d.source.x; })
            .attr("y1", function (d) { return d.source.y; })
            .attr("x2", function (d) { return d.target.x; })
            .attr("y2", function (d) { return d.target.y; });
        link.select("text")
            .attr("x", function (d) { return (d.source.x + d.target.x) / 2; })
            .attr("y", function (d) { return (d.source.y + d.target.y) / 2; });
        node.attr("transform", function (d) {
            return "translate(" + d.x + "," + d.y + ")";
        });
    });
    self.simulation.force("link").links(self.links);
    self.simulation.alpha(1).restart();
};
