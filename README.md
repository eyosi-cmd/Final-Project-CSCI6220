## ClusterOS

ClusterOS is a distributed systems simulation based on "Distributed Systems: Concepts and Design (5th Edition)" by George Coulouris. It demonstrates a Load Balancer acting as the kernel, providing a Single System Image over commodity worker nodes using raw TCP sockets.

### Getting Started

Navigate to the `cluster-os` directory and follow the instructions in its README.md.

### Project Structure

- `cluster-os/`: The main project directory containing the distributed system simulation.

### Running the Simulation

See the README.md in `cluster-os/` for detailed instructions on running the Load Balancer, Worker Nodes, and Client.

## Distributed Systems Concepts in this Project
This project maps to ideas from Coulouris et al., Distributed Systems: Concepts and Design (5th Ed.).

Server Architecture and Threading (Chapter 7)
- The project separates network I/O and processing: the `Dispatcher` handles TCP connections and queues messages, while a pool of `Worker` actors consumes and processes those messages. This matches the worker-pool pattern described in the textbook.
- Prioritized queues (HIGH / NORMAL / LOW) are used to influence scheduling and request handling, demonstrating practical priority management.

Failure Detection and Fault Tolerance (Chapter 2)
- The system includes a failure detector, job timeouts, retry logic, and per-worker circuit breakers. Timeouts are used to suspect crashed or unresponsive nodes, and retries are used to mask omission failures by retransmission.

Load Sharing and Node Selection (Chapter 7)
- The scheduler chooses nodes using health and load information (for example via `getHealthyNodesByLoad`). This implements a location policy that adaptively distributes requests across healthy nodes to avoid hotspots.

Distributed Computation and Job Splitting (Chapter 21)
- Large jobs can be split into chunks, dispatched in parallel to multiple workers, and the results aggregated. This behavior is similar to the MapReduce-style approach from the Google case study: partition, parallel process, then combine.
- This project provides a hands-on bridge between theory and practice. Future improvements could include bounded queues for backpressure, centralized state for multi-LB deployments, and more robust metrics/observability.
