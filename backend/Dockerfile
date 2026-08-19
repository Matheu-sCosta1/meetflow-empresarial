FROM maven:3.9.9-eclipse-temurin-17 AS build
WORKDIR /build
COPY pom.xml .
RUN mvn -q -DskipTests dependency:go-offline
COPY src src
RUN mvn -q -DskipTests package

FROM eclipse-temurin:17-jre-alpine
WORKDIR /app
RUN addgroup -S meetflow && adduser -S meetflow -G meetflow && mkdir -p /app/uploads && chown -R meetflow:meetflow /app
COPY --from=build /build/target/*.jar app.jar
USER meetflow
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
