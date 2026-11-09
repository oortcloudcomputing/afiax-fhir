# Static Afiax web apps (Afiax Provider, My Afiax): the Vite build is served by unprivileged nginx.
# The build uses placeholders (__MEDPLUM_BASE_URL__ ...) that entrypoint.sh replaces at start-up,
# so one image serves every environment.
#   docker buildx build -f scripts/afiax/web-app/Dockerfile \
#     --build-context web=scripts/afiax/web-app examples/medplum-provider/dist
FROM nginxinc/nginx-unprivileged:alpine
USER root
COPY --from=web nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=web entrypoint.sh /entrypoint.sh
COPY . /usr/share/nginx/html
RUN chown -R 101:101 /usr/share/nginx/html /entrypoint.sh && chmod +x /entrypoint.sh
EXPOSE 3000
USER 101
ENTRYPOINT ["/entrypoint.sh"]
