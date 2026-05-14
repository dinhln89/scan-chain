FROM ghcr.io/nevillegrech/gigahorse-toolchain-deps-souffle24:latest

USER root

ENV DEBIAN_FRONTEND=noninteractive

# Set up a non-root 'gigahorse' user
RUN groupadd -r gigahorse && useradd -ms /bin/bash -g gigahorse gigahorse

RUN mkdir -p /opt/gigahorse/gigahorse-toolchain

# Copy gigahorse project root
COPY . /opt/gigahorse/gigahorse-toolchain/

RUN chown -R gigahorse:gigahorse /opt/gigahorse
RUN chmod -R o+rwx /opt/gigahorse

# Switch to new 'gigahorse' user context
USER gigahorse

# Souffle-addon bare-minimum make (override CC/CXX since base image may not have gcc-15)
RUN cd /opt/gigahorse/gigahorse-toolchain/souffle-addon && make libsoufflenum.so CC=gcc CXX=g++

CMD ["-h"]
ENTRYPOINT ["/opt/gigahorse/gigahorse-toolchain/gigahorse.py"]

# Commenting it out, to be uncommented and to debug and run as interactive container
# # Start gigahorse user in logic subdir ready to run Gigahorse
# EXPOSE 8888
# USER gigahorse
# WORKDIR /opt/gigahorse/gigahorse-toolchain